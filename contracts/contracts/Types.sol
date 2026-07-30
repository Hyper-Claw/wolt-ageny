// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Social links carried on a launch token (mirrors Pons `socials()`).
struct Socials {
    string twitter;
    string telegram;
    string discord;
    string website;
    string farcaster;
}

/// @notice Parameters for launching a token.
struct LaunchParams {
    string name;
    string symbol;
    string logo;
    string description;
    Socials socials;
}

/// @notice Launch-level state, returned by `getLaunchedToken` (Pons-compatible).
struct LaunchedToken {
    address token;
    address deployer;
    address pairedToken;
    address positionManager;
    uint256 positionId;
    uint256 dexId;
    uint256 launchConfigId;
    uint256 restrictionsEndBlock;
    uint256 supply;
    bool isToken0;
    uint24 poolFee;
    bool exists;
    uint256 initialBuyAmount;
}
