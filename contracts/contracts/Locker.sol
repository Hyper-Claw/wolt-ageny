// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INonfungiblePositionManager} from "./interfaces/IUniswapV3.sol";
import {LaunchToken} from "./LaunchToken.sol";

/// @title Locker
/// @notice Custodies each launch pool's Uniswap V3 LP position (the liquidity is
///         locked here forever) and holds the snapshotted fee split (Pons-
///         compatible). LP fees can be collected permissionlessly and are split
///         between the protocol and the token's creator/payout wallet.
///         Creator share = `100 - tokenProtocolFeeShares[token]` (percent).
contract Locker {
    address public immutable launchpad;
    INonfungiblePositionManager public immutable positionManager;
    address public protocolFeeRecipient;

    mapping(address => uint256) public tokenProtocolFeeShares; // percent, 0-100
    mapping(address => address) public feeRedirects; // token => payout wallet (0 = deployer)
    mapping(address => uint256) public positionIds; // token => LP NFT id

    event FeesCollected(address indexed token, uint256 amount0, uint256 amount1);

    constructor(address launchpad_, address positionManager_, address protocolFeeRecipient_) {
        launchpad = launchpad_;
        positionManager = INonfungiblePositionManager(positionManager_);
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    function register(address token, uint256 positionId, uint256 protocolShare, address redirect) external {
        require(msg.sender == launchpad, "only launchpad");
        require(protocolShare <= 100, "share>100");
        positionIds[token] = positionId;
        tokenProtocolFeeShares[token] = protocolShare;
        feeRedirects[token] = redirect;
    }

    function setProtocolFeeRecipient(address recipient) external {
        require(msg.sender == launchpad, "only launchpad");
        require(recipient != address(0), "zero");
        protocolFeeRecipient = recipient;
    }

    /// @notice Collect accrued LP fees for a token and split protocol/creator.
    function collectFees(address token) external returns (uint256 amount0, uint256 amount1) {
        uint256 id = positionIds[token];
        require(id != 0, "unknown token");

        (amount0, amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: id,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        (,, address t0, address t1,,,,,,,,) = positionManager.positions(id);
        address creator = feeRedirects[token];
        if (creator == address(0)) creator = LaunchToken(token).deployer();
        uint256 protocolShare = tokenProtocolFeeShares[token];

        _split(t0, amount0, protocolShare, creator);
        _split(t1, amount1, protocolShare, creator);

        emit FeesCollected(token, amount0, amount1);
    }

    function _split(address asset, uint256 amount, uint256 protocolShare, address creator) internal {
        if (amount == 0) return;
        uint256 protocolCut = (amount * protocolShare) / 100;
        uint256 creatorCut = amount - protocolCut;
        if (protocolCut > 0) IERC20(asset).transfer(protocolFeeRecipient, protocolCut);
        if (creatorCut > 0) IERC20(asset).transfer(creator, creatorCut);
    }
}
