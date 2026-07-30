// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Socials} from "./Types.sol";

/// @title LaunchToken
/// @notice A fixed-supply, self-describing ERC20 (Pons-compatible). The whole
///         supply is minted to its launchpad, which seeds it as single-sided
///         liquidity in a Uniswap V3 pool. No owner, no post-deploy mint, so the
///         supply is immutable. Metadata (logo, description, socials) and the
///         launch pool are readable directly on-chain.
contract LaunchToken is ERC20 {
    address public immutable launchpad;
    address public immutable deployer;
    address public immutable pairedToken;
    uint24 public immutable poolFee;
    address public liquidityPool;

    string private _logo;
    string private _description;
    Socials private _socials;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address launchpad_,
        address deployer_,
        address pairedToken_,
        uint24 poolFee_,
        string memory logo_,
        string memory description_,
        Socials memory socials_
    ) ERC20(name_, symbol_) {
        launchpad = launchpad_;
        deployer = deployer_;
        pairedToken = pairedToken_;
        poolFee = poolFee_;
        _logo = logo_;
        _description = description_;
        _socials = socials_;
        _mint(launchpad_, supply_);
    }

    function logo() external view returns (string memory) {
        return _logo;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function socials()
        external
        view
        returns (string memory twitter, string memory telegram, string memory discord, string memory website, string memory farcaster)
    {
        Socials storage s = _socials;
        return (s.twitter, s.telegram, s.discord, s.website, s.farcaster);
    }

    /// @notice Recorded once by the launchpad after the pool is created.
    function setLiquidityPool(address pool) external {
        require(msg.sender == launchpad, "only launchpad");
        require(liquidityPool == address(0), "already set");
        liquidityPool = pool;
    }
}
