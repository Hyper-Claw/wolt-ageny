// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal Multicall3-compatible aggregator. Implements `aggregate3`, which is
 * what viem's `publicClient.multicall` calls, so the whole app can batch every
 * read into a single eth_call — one Tor round-trip instead of dozens.
 *
 * Deploy once on Arc, then set NEXT_PUBLIC_MULTICALL3 to its address.
 */
contract Multicall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData) {
        uint256 len = calls.length;
        returnData = new Result[](len);
        for (uint256 i = 0; i < len; i++) {
            Call3 calldata c = calls[i];
            (bool success, bytes memory ret) = c.target.call(c.callData);
            if (!success && !c.allowFailure) {
                // bubble up the revert reason
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            returnData[i] = Result(success, ret);
        }
    }
}
