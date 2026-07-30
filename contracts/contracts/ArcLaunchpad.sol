// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LaunchToken} from "./LaunchToken.sol";

/// @title ArcLaunchpad
/// @notice A pump.fun / Pons-style token launchpad for the Arc chain.
///         Anyone can deploy a token and its bonding-curve pool in a single
///         transaction. Tokens trade against Arc's native gas asset (USDC) on a
///         constant-product virtual-reserve bonding curve. Once a token raises
///         enough to sell out its curve allocation it "graduates": curve trading
///         stops and the reserved liquidity (LP token allocation + collected
///         native) is locked, ready for migration to a DEX.
///
/// @dev Native amounts (`msg.value`, reserves, fees) are denominated in the
///      chain's native gas token. On Arc that is USDC. All curve parameters are
///      set once at deployment as immutables so they can be tuned to the chain's
///      native decimals without changing the code.
contract ArcLaunchpad is ReentrancyGuard, Ownable {
    // ---------------------------------------------------------------------
    // Curve parameters (immutable, set at deployment)
    // ---------------------------------------------------------------------

    /// @notice Total supply minted for every launched token.
    uint256 public immutable totalSupply;
    /// @notice Portion of supply sold through the bonding curve.
    uint256 public immutable curveSupply;
    /// @notice Portion of supply reserved for post-graduation liquidity.
    uint256 public immutable lpSupply;
    /// @notice Virtual native reserve seeding the curve (sets the start price).
    uint256 public immutable virtualNative;
    /// @notice Virtual token reserve seeding the curve.
    uint256 public immutable virtualToken;
    /// @notice Constant product invariant: virtualNative * virtualToken.
    uint256 public immutable k;
    /// @notice Token reserve at the exact graduation point (virtualToken - curveSupply).
    uint256 public immutable gradReserveToken;

    // ---------------------------------------------------------------------
    // Fees & config
    // ---------------------------------------------------------------------

    uint256 public constant BPS = 10_000;
    /// @notice Total trade fee in basis points (taken on every buy and sell).
    uint256 public tradeFeeBps;
    /// @notice Portion of the trade fee (in bps of the total fee) paid to the token creator.
    uint256 public creatorFeeShareBps;
    /// @notice Flat fee (native) charged to launch a token.
    uint256 public creationFee;
    /// @notice Recipient of platform fees.
    address public feeRecipient;
    /// @notice Address allowed to migrate graduated liquidity to a DEX.
    address public liquidityMigrator;

    // ---------------------------------------------------------------------
    // Per-token curve state
    // ---------------------------------------------------------------------

    struct Curve {
        address token; // ERC20 address (also the key)
        address creator; // launcher
        uint256 realNativeReserve; // real native collected in the curve
        uint256 tokensSold; // curve tokens sold so far
        bool graduated; // curve trading closed
        uint256 createdAt; // block timestamp of launch
    }

    /// @notice Curve state keyed by token address.
    mapping(address => Curve) public curves;
    /// @notice All launched token addresses, in creation order.
    address[] public allTokens;
    /// @notice Native + LP tokens locked for a graduated token, pending migration.
    mapping(address => uint256) public lockedNative;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string uri,
        string description,
        string twitter,
        string telegram,
        string website,
        uint256 timestamp
    );

    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 nativeAmount,
        uint256 tokenAmount,
        uint256 feePaid,
        uint256 newTokensSold,
        uint256 newRealNativeReserve,
        uint256 timestamp
    );

    event Graduated(address indexed token, uint256 nativeLocked, uint256 lpTokensLocked, uint256 timestamp);
    event LiquidityMigrated(address indexed token, address indexed to, uint256 nativeAmount, uint256 lpTokens);
    event ConfigUpdated(uint256 tradeFeeBps, uint256 creatorFeeShareBps, uint256 creationFee, address feeRecipient);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error DeadlinePassed();
    error CurveGraduated();
    error CurveNotGraduated();
    error SlippageExceeded();
    error InsufficientPayment();
    error InvalidAmount();
    error NotMigrator();
    error TransferFailed();
    error UnknownToken();

    constructor(
        uint256 totalSupply_,
        uint256 curveSupply_,
        uint256 virtualNative_,
        uint256 virtualToken_,
        uint256 tradeFeeBps_,
        uint256 creatorFeeShareBps_,
        uint256 creationFee_,
        address feeRecipient_
    ) Ownable(msg.sender) {
        require(curveSupply_ < totalSupply_, "curveSupply>=totalSupply");
        require(curveSupply_ < virtualToken_, "curveSupply>=virtualToken");
        require(virtualNative_ > 0 && virtualToken_ > 0, "zero virtual reserve");
        require(tradeFeeBps_ <= 1_000, "fee too high"); // <=10%
        require(creatorFeeShareBps_ <= BPS, "share>100%");
        require(feeRecipient_ != address(0), "zero feeRecipient");

        totalSupply = totalSupply_;
        curveSupply = curveSupply_;
        lpSupply = totalSupply_ - curveSupply_;
        virtualNative = virtualNative_;
        virtualToken = virtualToken_;
        k = virtualNative_ * virtualToken_;
        gradReserveToken = virtualToken_ - curveSupply_;

        tradeFeeBps = tradeFeeBps_;
        creatorFeeShareBps = creatorFeeShareBps_;
        creationFee = creationFee_;
        feeRecipient = feeRecipient_;
        liquidityMigrator = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Launch
    // ---------------------------------------------------------------------

    /// @notice Deploy a token and open its bonding-curve pool in one transaction.
    /// @dev `msg.value` must cover the creation fee. Any excess is treated as an
    ///      optional "dev buy" executed on the new curve for the creator.
    /// @param name Token name.
    /// @param symbol Token ticker.
    /// @param uri Off-chain metadata / image URI.
    /// @param description Free-text description.
    /// @param twitter Social link (may be empty).
    /// @param telegram Social link (may be empty).
    /// @param website Social link (may be empty).
    /// @param minTokensOut Slippage guard for the optional dev buy.
    /// @return token The address of the newly created ERC20.
    function launch(
        string calldata name,
        string calldata symbol,
        string calldata uri,
        string calldata description,
        string calldata twitter,
        string calldata telegram,
        string calldata website,
        uint256 minTokensOut
    ) external payable nonReentrant returns (address token) {
        if (msg.value < creationFee) revert InsufficientPayment();

        LaunchToken t = new LaunchToken(name, symbol, totalSupply, address(this), msg.sender);
        token = address(t);

        curves[token] = Curve({
            token: token,
            creator: msg.sender,
            realNativeReserve: 0,
            tokensSold: 0,
            graduated: false,
            createdAt: block.timestamp
        });
        allTokens.push(token);

        emit TokenLaunched(
            token, msg.sender, name, symbol, uri, description, twitter, telegram, website, block.timestamp
        );

        // Forward the creation fee to the platform.
        if (creationFee > 0) {
            _sendNative(feeRecipient, creationFee);
        }

        // Optional dev buy with any remaining value.
        uint256 devBuy = msg.value - creationFee;
        if (devBuy > 0) {
            _buy(token, msg.sender, devBuy, minTokensOut);
        } else if (minTokensOut > 0) {
            revert InvalidAmount();
        }
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @notice Buy tokens from a curve with native value.
    /// @param token The token to buy.
    /// @param minTokensOut Minimum tokens to receive (slippage guard).
    /// @param deadline Unix timestamp after which the trade reverts.
    function buy(address token, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert DeadlinePassed();
        tokensOut = _buy(token, msg.sender, msg.value, minTokensOut);
    }

    /// @notice Sell tokens back to a curve for native value.
    /// @param token The token to sell.
    /// @param tokenAmount Amount of tokens to sell.
    /// @param minNativeOut Minimum native to receive (slippage guard).
    /// @param deadline Unix timestamp after which the trade reverts.
    function sell(address token, uint256 tokenAmount, uint256 minNativeOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 nativeOut)
    {
        if (block.timestamp > deadline) revert DeadlinePassed();
        Curve storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (c.graduated) revert CurveGraduated();
        if (tokenAmount == 0 || tokenAmount > c.tokensSold) revert InvalidAmount();

        // Pull tokens in first (checks-effects-interactions: external ERC20 call
        // before state mutation is safe here because of nonReentrant and because
        // the token is trusted — it was deployed by this contract).
        _pullTokens(token, msg.sender, tokenAmount);

        uint256 reserveNative = virtualNative + c.realNativeReserve;
        uint256 reserveToken = virtualToken - c.tokensSold;
        uint256 newReserveToken = reserveToken + tokenAmount;
        uint256 newReserveNative = _ceilDiv(k, newReserveToken);
        uint256 grossOut = reserveNative - newReserveNative;

        uint256 fee = (grossOut * tradeFeeBps) / BPS;
        nativeOut = grossOut - fee;
        if (nativeOut < minNativeOut) revert SlippageExceeded();

        c.realNativeReserve -= grossOut;
        c.tokensSold -= tokenAmount;

        _distributeFee(fee, c.creator);
        _sendNative(msg.sender, nativeOut);

        emit Trade(
            token, msg.sender, false, nativeOut, tokenAmount, fee, c.tokensSold, c.realNativeReserve, block.timestamp
        );
    }

    /// @dev Shared buy logic used by `buy` and the launch dev-buy.
    function _buy(address token, address buyer, uint256 grossIn, uint256 minTokensOut)
        internal
        returns (uint256 tokensOut)
    {
        Curve storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (c.graduated) revert CurveGraduated();
        if (grossIn == 0) revert InvalidAmount();

        uint256 reserveNative = virtualNative + c.realNativeReserve;
        uint256 reserveToken = virtualToken - c.tokensSold;

        // Fee off the top; the remainder feeds the curve.
        uint256 fee = (grossIn * tradeFeeBps) / BPS;
        uint256 curveIn = grossIn - fee;

        uint256 newReserveNative = reserveNative + curveIn;
        uint256 newReserveToken = _ceilDiv(k, newReserveNative);
        tokensOut = reserveToken - newReserveToken;

        uint256 remaining = curveSupply - c.tokensSold;
        uint256 refund = 0;
        bool graduating = false;

        if (tokensOut >= remaining) {
            // Cap the buy at the graduation boundary and refund the excess
            // (including the fee that would have applied to the refunded amount).
            tokensOut = remaining;
            uint256 nativeNeeded = _ceilDiv(k, gradReserveToken) - reserveNative;
            uint256 grossNeeded = _ceilDiv(nativeNeeded * BPS, BPS - tradeFeeBps);
            refund = grossIn - grossNeeded;
            fee = grossNeeded - nativeNeeded;
            curveIn = nativeNeeded;
            graduating = true;
        }

        if (tokensOut < minTokensOut) revert SlippageExceeded();

        c.realNativeReserve += curveIn;
        c.tokensSold += tokensOut;

        if (graduating) {
            c.graduated = true;
            lockedNative[token] = c.realNativeReserve;
            emit Graduated(token, c.realNativeReserve, lpSupply, block.timestamp);
        }

        _distributeFee(fee, c.creator);
        _sendTokens(token, buyer, tokensOut);
        if (refund > 0) {
            _sendNative(buyer, refund);
        }

        emit Trade(
            token, buyer, true, curveIn, tokensOut, fee, c.tokensSold, c.realNativeReserve, block.timestamp
        );
    }

    // ---------------------------------------------------------------------
    // Views (quotes & discovery)
    // ---------------------------------------------------------------------

    /// @notice Quote tokens received for a given native input (net of fees).
    function calcBuy(address token, uint256 grossIn) external view returns (uint256 tokensOut) {
        Curve storage c = curves[token];
        if (c.token == address(0) || c.graduated || grossIn == 0) return 0;
        uint256 reserveNative = virtualNative + c.realNativeReserve;
        uint256 reserveToken = virtualToken - c.tokensSold;
        uint256 curveIn = grossIn - (grossIn * tradeFeeBps) / BPS;
        uint256 newReserveToken = _ceilDiv(k, reserveNative + curveIn);
        tokensOut = reserveToken - newReserveToken;
        uint256 remaining = curveSupply - c.tokensSold;
        if (tokensOut > remaining) tokensOut = remaining;
    }

    /// @notice Quote native received for selling a given token amount (net of fees).
    function calcSell(address token, uint256 tokenAmount) external view returns (uint256 nativeOut) {
        Curve storage c = curves[token];
        if (c.token == address(0) || c.graduated || tokenAmount == 0 || tokenAmount > c.tokensSold) return 0;
        uint256 reserveNative = virtualNative + c.realNativeReserve;
        uint256 newReserveNative = _ceilDiv(k, (virtualToken - c.tokensSold) + tokenAmount);
        uint256 grossOut = reserveNative - newReserveNative;
        nativeOut = grossOut - (grossOut * tradeFeeBps) / BPS;
    }

    /// @notice Current spot price: native per token, scaled by 1e18.
    function spotPrice(address token) public view returns (uint256) {
        Curve storage c = curves[token];
        if (c.token == address(0)) return 0;
        uint256 reserveNative = virtualNative + c.realNativeReserve;
        uint256 reserveToken = virtualToken - c.tokensSold;
        return (reserveNative * 1e18) / reserveToken;
    }

    /// @notice Fully-diluted market cap in native units (spot price * total supply).
    function marketCap(address token) external view returns (uint256) {
        return (spotPrice(token) * totalSupply) / 1e18;
    }

    /// @notice Curve completion in basis points (0 = fresh, 10000 = graduated).
    function progressBps(address token) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.token == address(0)) return 0;
        return (c.tokensSold * BPS) / curveSupply;
    }

    /// @notice Number of tokens ever launched.
    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    /// @notice Paginated list of launched token addresses (newest-first).
    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = allTokens.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new address[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            // newest-first
            page[i] = allTokens[n - 1 - (offset + i)];
        }
    }

    // ---------------------------------------------------------------------
    // Graduation / migration
    // ---------------------------------------------------------------------

    /// @notice Move a graduated token's locked liquidity (native + LP tokens) to a
    ///         DEX or locker. Restricted to the configured migrator. This is the
    ///         hook for automatic DEX migration once a DEX exists on Arc.
    function migrateLiquidity(address token, address to) external nonReentrant {
        if (msg.sender != liquidityMigrator) revert NotMigrator();
        Curve storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (!c.graduated) revert CurveNotGraduated();
        if (to == address(0)) revert InvalidAmount();

        uint256 nativeAmt = lockedNative[token];
        lockedNative[token] = 0;

        _sendTokens(token, to, lpSupply);
        if (nativeAmt > 0) {
            _sendNative(to, nativeAmt);
        }
        emit LiquidityMigrated(token, to, nativeAmt, lpSupply);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setConfig(uint256 tradeFeeBps_, uint256 creatorFeeShareBps_, uint256 creationFee_, address feeRecipient_)
        external
        onlyOwner
    {
        require(tradeFeeBps_ <= 1_000, "fee too high");
        require(creatorFeeShareBps_ <= BPS, "share>100%");
        require(feeRecipient_ != address(0), "zero feeRecipient");
        tradeFeeBps = tradeFeeBps_;
        creatorFeeShareBps = creatorFeeShareBps_;
        creationFee = creationFee_;
        feeRecipient = feeRecipient_;
        emit ConfigUpdated(tradeFeeBps_, creatorFeeShareBps_, creationFee_, feeRecipient_);
    }

    function setLiquidityMigrator(address migrator) external onlyOwner {
        liquidityMigrator = migrator;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _distributeFee(uint256 fee, address creator) internal {
        if (fee == 0) return;
        uint256 creatorCut = (fee * creatorFeeShareBps) / BPS;
        uint256 platformCut = fee - creatorCut;
        if (creatorCut > 0) _sendNative(creator, creatorCut);
        if (platformCut > 0) _sendNative(feeRecipient, platformCut);
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _sendTokens(address token, address to, uint256 amount) internal {
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
    }

    function _pullTokens(address token, address from, uint256 amount) internal {
        if (!IERC20(token).transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }
}
