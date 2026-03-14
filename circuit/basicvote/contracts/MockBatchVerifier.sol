// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockBatchVerifier {
    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[4] memory
    ) external pure returns (bool) {
        return true;
    }
}
