// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {Locker} from "./Locker.sol";
import {TickMath} from "./libraries/TickMath.sol";
import {
    IUniswapV3Factory,
    IUniswapV3Pool,
    INonfungiblePositionManager,
    ISwapRouter
} from "./interfaces/IUniswapV3.sol";
import {LaunchParams, LaunchedToken} from "./Types.sol";

/// @title ArcLaunchpad
/// @notice A Pons / DYOR-style token launchpad for the Arc chain, built on real
///         Uniswap V3. `launch()` deploys a self-describing token and, in the
///         same transaction, creates its V3 pool and seeds the entire supply as
///         a single-sided concentrated-liquidity position — the position IS the
///         bonding curve. The LP is minted to a Locker and stays locked; trading
///         continues in the same pool before and after graduation.
///
/// @dev Tokens are paired against USDC. On Arc, USDC's ERC-20 interface lives at
///      0x3600000000000000000000000000000000000000 and uses 6 decimals (the
///      native gas interface uses 18) — there is no wrapped USDC, so the pool
///      pairs against the ERC-20 directly. Launch tokens use 18 decimals, so all
///      price math is decimal-aware via `priceScale`. Trading routes through the
///      V3 router with plain ERC-20 USDC (approve + transferFrom), which works
///      identically on Arc and locally. All V3 addresses, the USDC address and
///      the curve economics are constructor-configured per network.
contract ArcLaunchpad is ReentrancyGuard, Ownable {
    using Math for uint256;

    uint256 private constant Q96 = 0x1000000000000000000000000; // 2^96
    uint256 public constant BPS = 10_000;
    uint8 public constant TOKEN_DECIMALS = 18;

    // --- V3 wiring (immutable) ---
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter public immutable swapRouter;
    IUniswapV3Factory public immutable factory;
    address public immutable usdc; // pair / quote token (ERC-20)
    uint8 public immutable pairedDecimals;
    uint256 public immutable priceScale; // 10^(TOKEN_DECIMALS + 18 - pairedDecimals)
    Locker public immutable locker;

    // --- Curve economics (immutable) ---
    uint256 public immutable tokenTotalSupply;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    int24 public immutable tickLower; // canonical (token = token0) convention
    int24 public immutable tickUpper;
    uint256 public immutable graduationThreshold; // USDC principal to graduate
    uint256 public immutable restrictionBlocks;

    // --- Config ---
    address public feeRecipient;
    uint256 public protocolFeePercent; // protocol share of LP fees (0-100)

    // --- State ---
    mapping(address => LaunchedToken) private _launched;
    mapping(address => address) public poolOf;
    mapping(address => address) public creatorOf;
    mapping(address => uint256) public createdAt;
    mapping(address => bool) private _graduated;
    address[] public allTokens;

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string logo,
        address pool,
        uint256 timestamp
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 usdcAmount,
        uint256 tokenAmount,
        uint256 timestamp
    );
    event Graduated(address indexed token, uint256 principal, uint256 timestamp);

    error DeadlinePassed();
    error InvalidAmount();
    error TransferFailed();
    error UnknownToken();

    constructor(
        address positionManager_,
        address swapRouter_,
        address factory_,
        address usdc_,
        uint8 pairedDecimals_,
        address feeRecipient_,
        uint24 poolFee_,
        int24 tickSpacing_,
        int24 tickLower_,
        int24 tickUpper_,
        uint256 totalSupply_,
        uint256 graduationThreshold_,
        uint256 protocolFeePercent_,
        uint256 restrictionBlocks_
    ) Ownable(msg.sender) {
        require(feeRecipient_ != address(0) && usdc_ != address(0), "zero addr");
        require(tickLower_ < tickUpper_, "tick order");
        require(tickLower_ % tickSpacing_ == 0 && tickUpper_ % tickSpacing_ == 0, "tick spacing");
        require(protocolFeePercent_ <= 100, "share>100");
        require(pairedDecimals_ <= 36, "decimals");

        positionManager = INonfungiblePositionManager(positionManager_);
        swapRouter = ISwapRouter(swapRouter_);
        factory = IUniswapV3Factory(factory_);
        usdc = usdc_;
        pairedDecimals = pairedDecimals_;
        priceScale = 10 ** (uint256(TOKEN_DECIMALS) + 18 - pairedDecimals_);

        feeRecipient = feeRecipient_;
        poolFee = poolFee_;
        tickSpacing = tickSpacing_;
        tickLower = tickLower_;
        tickUpper = tickUpper_;
        tokenTotalSupply = totalSupply_;
        graduationThreshold = graduationThreshold_;
        protocolFeePercent = protocolFeePercent_;
        restrictionBlocks = restrictionBlocks_;

        locker = new Locker(address(this), positionManager_, feeRecipient_);
    }

    // ---------------------------------------------------------------------
    // Launch
    // ---------------------------------------------------------------------

    /// @notice Deploy a token, create its V3 pool and seed the full supply as a
    ///         single-sided position, all in one transaction.
    function launch(LaunchParams calldata p) external nonReentrant returns (address token) {
        LaunchToken t = new LaunchToken(
            p.name, p.symbol, tokenTotalSupply, address(this), msg.sender, usdc, poolFee, p.logo, p.description, p.socials
        );
        token = address(t);

        bool tokenIsToken0 = uint160(token) < uint160(usdc);
        (address token0, address token1) = tokenIsToken0 ? (token, usdc) : (usdc, token);

        // Orientation-aware tick range and single-sided init price.
        int24 tl;
        int24 tu;
        int24 initTick;
        uint256 amount0;
        uint256 amount1;
        if (tokenIsToken0) {
            tl = tickLower;
            tu = tickUpper;
            initTick = tickLower - tickSpacing; // below range => 100% token0 (token)
            amount0 = tokenTotalSupply;
        } else {
            tl = -tickUpper;
            tu = -tickLower;
            initTick = (-tickLower) + tickSpacing; // above range => 100% token1 (token)
            amount1 = tokenTotalSupply;
        }

        address pool = positionManager.createAndInitializePoolIfNecessary(
            token0, token1, poolFee, TickMath.getSqrtRatioAtTick(initTick)
        );
        t.setLiquidityPool(pool);
        poolOf[token] = pool;

        IERC20(token).approve(address(positionManager), tokenTotalSupply);
        (uint256 tokenId,,,) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: poolFee,
                tickLower: tl,
                tickUpper: tu,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(locker),
                deadline: block.timestamp
            })
        );

        creatorOf[token] = msg.sender;
        createdAt[token] = block.timestamp;
        _launched[token] = LaunchedToken({
            token: token,
            deployer: msg.sender,
            pairedToken: usdc,
            positionManager: address(positionManager),
            positionId: tokenId,
            dexId: 0,
            launchConfigId: 0,
            restrictionsEndBlock: block.number + restrictionBlocks,
            supply: tokenTotalSupply,
            isToken0: tokenIsToken0,
            poolFee: poolFee,
            exists: true,
            initialBuyAmount: 0
        });
        allTokens.push(token);

        locker.register(token, tokenId, protocolFeePercent, msg.sender);

        emit TokenLaunched(token, msg.sender, p.name, p.symbol, p.logo, pool, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Trading (USDC <-> token via the V3 router)
    // ---------------------------------------------------------------------

    /// @notice Buy `token` with `usdcIn` USDC (6-dec). Caller must approve USDC
    ///         to this contract first.
    function buy(address token, uint256 usdcIn, uint256 minTokensOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (poolOf[token] == address(0)) revert UnknownToken();
        if (usdcIn == 0) revert InvalidAmount();

        if (!IERC20(usdc).transferFrom(msg.sender, address(this), usdcIn)) revert TransferFailed();
        IERC20(usdc).approve(address(swapRouter), usdcIn);

        tokensOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: usdc,
                tokenOut: token,
                fee: poolFee,
                recipient: msg.sender,
                deadline: deadline,
                amountIn: usdcIn,
                amountOutMinimum: minTokensOut,
                sqrtPriceLimitX96: 0
            })
        );

        emit Trade(token, msg.sender, true, usdcIn, tokensOut, block.timestamp);
        _checkGraduation(token);
    }

    /// @notice Sell `tokenAmount` of `token` for USDC. Caller must approve the
    ///         token to this contract first.
    function sell(address token, uint256 tokenAmount, uint256 minUsdcOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 usdcOut)
    {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (poolOf[token] == address(0)) revert UnknownToken();
        if (tokenAmount == 0) revert InvalidAmount();

        if (!IERC20(token).transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();
        IERC20(token).approve(address(swapRouter), tokenAmount);

        usdcOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: token,
                tokenOut: usdc,
                fee: poolFee,
                recipient: msg.sender,
                deadline: deadline,
                amountIn: tokenAmount,
                amountOutMinimum: minUsdcOut,
                sqrtPriceLimitX96: 0
            })
        );

        emit Trade(token, msg.sender, false, usdcOut, tokenAmount, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Graduation
    // ---------------------------------------------------------------------

    function graduate(address token) public {
        if (!_graduated[token] && pairedPrincipal(token) >= graduationThreshold) {
            _graduated[token] = true;
            emit Graduated(token, pairedPrincipal(token), block.timestamp);
        }
    }

    function _checkGraduation(address token) internal {
        if (!_graduated[token] && pairedPrincipal(token) >= graduationThreshold) {
            _graduated[token] = true;
            emit Graduated(token, pairedPrincipal(token), block.timestamp);
        }
    }

    /// @notice USDC principal accumulated in the pool.
    function pairedPrincipal(address token) public view returns (uint256) {
        address pool = poolOf[token];
        if (pool == address(0)) return 0;
        return IERC20(usdc).balanceOf(pool);
    }

    function graduationStatus(address token)
        external
        view
        returns (uint256 principal, uint256 threshold, bool graduated)
    {
        principal = pairedPrincipal(token);
        threshold = graduationThreshold;
        graduated = _graduated[token];
    }

    // ---------------------------------------------------------------------
    // Pricing & discovery views
    // ---------------------------------------------------------------------

    /// @notice Spot price in USDC per token, scaled by 1e18 (decimal-aware).
    function spotPrice(address token) public view returns (uint256) {
        address pool = poolOf[token];
        if (pool == address(0)) return 0;
        (uint160 sqrtP,,,,,,) = IUniswapV3Pool(pool).slot0();
        uint256 s = uint256(sqrtP);
        if (s == 0) return 0;
        if (_launched[token].isToken0) {
            // token0 = token, token1 = usdc  =>  usdc/token = price_raw * priceScale
            return Math.mulDiv(Math.mulDiv(s, s, Q96), priceScale, Q96);
        } else {
            // token0 = usdc, token1 = token  =>  usdc/token = priceScale / price_raw
            uint256 inv = Math.mulDiv(Q96, Q96, s); // 2^192 / sqrtP
            return Math.mulDiv(inv, priceScale, s); // 2^192 * priceScale / sqrtP^2
        }
    }

    /// @notice Fully-diluted market cap in USDC, scaled by 1e18.
    function marketCap(address token) external view returns (uint256) {
        return (spotPrice(token) * tokenTotalSupply) / 1e18;
    }

    function progressBps(address token) external view returns (uint256) {
        uint256 principal = pairedPrincipal(token);
        if (graduationThreshold == 0) return 0;
        uint256 bps = (principal * BPS) / graduationThreshold;
        return bps > BPS ? BPS : bps;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory launched) {
        return _launched[token];
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = allTokens.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new address[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = allTokens[n - 1 - (offset + i)];
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setConfig(address feeRecipient_, uint256 protocolFeePercent_) external onlyOwner {
        require(feeRecipient_ != address(0), "zero feeRecipient");
        require(protocolFeePercent_ <= 100, "share>100");
        feeRecipient = feeRecipient_;
        protocolFeePercent = protocolFeePercent_;
        locker.setProtocolFeeRecipient(feeRecipient_);
    }
}
