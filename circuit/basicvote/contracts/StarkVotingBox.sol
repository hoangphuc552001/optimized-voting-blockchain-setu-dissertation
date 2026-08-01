// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StarkVerifier.sol";

/**
 * StarkVotingBox — voting contract using a zk-STARK proof of knowledge.
 *
 * Mirrors BPVotingBox / the Groth16 BallotBox so the three protocols are
 * benchmarked through an identical interface: verify a proof, spend a
 * nullifier, tally a candidate.
 */
contract StarkVotingBox {

    StarkVerifier public immutable verifier;
    uint8 public constant NUM_CANDIDATES = 5;

    mapping(bytes32 => bool) public nullifierUsed;
    uint256[NUM_CANDIDATES] public voteCounts;
    uint256 public totalVotes;

    event VoteCast(bytes32 indexed nullifier, uint256 candidate);

    constructor(address _verifier) {
        verifier = StarkVerifier(_verifier);
    }

    function castVote(
        StarkVerifier.Proof calldata proof,
        uint256 candidate,
        bytes32 nullifier
    ) external {
        require(candidate < NUM_CANDIDATES, "Invalid candidate");
        require(!nullifierUsed[nullifier], "Already voted");
        require(verifier.verify(proof), "Invalid proof");

        nullifierUsed[nullifier] = true;
        voteCounts[candidate]++;
        totalVotes++;

        emit VoteCast(nullifier, candidate);
    }

    function getResults() external view returns (uint256[NUM_CANDIDATES] memory) {
        return voteCounts;
    }
}
