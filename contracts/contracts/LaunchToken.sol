// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LaunchToken
/// @notice A fixed-supply ERC20 minted in full to its launchpad at creation.
///         The launchpad holds the entire supply and distributes it through a
///         bonding curve. There is no owner and no mint function after
///         deployment, so the supply is immutable.
contract LaunchToken is ERC20 {
    /// @notice The launchpad that created and custodies this token's supply.
    address public immutable launchpad;

    /// @notice The account that launched the token (for display / attribution).
    address public immutable creator;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address launchpad_,
        address creator_
    ) ERC20(name_, symbol_) {
        launchpad = launchpad_;
        creator = creator_;
        _mint(launchpad_, supply_);
    }
}
