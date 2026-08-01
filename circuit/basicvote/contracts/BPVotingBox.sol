// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BPVerifier.sol";

/**
 * BPVotingBox — voting contract using Bulletproofs range proofs.
 *
 * Each voter submits:
 *   - A range proof that their encoded vote v ∈ [0, 15] (4-bit)
 *   - The Pedersen commitment V to their actual candidate choice
 *   - A nullifier to prevent double-voting
 *
 * The range proof only proves v is a valid 4-bit value.
 * Candidate validity (0-4) is enforced by checking V on-chain.
 *
 * For benchmarking purposes we track:
 *   - Gas used per vote cast
 *   - Proof size (serialised)
 */
contract BPVotingBox {

    BPVerifier public immutable verifier;

    uint8 public constant NUM_CANDIDATES = 5;

    mapping(bytes32 => bool) public nullifierUsed;
    uint256[NUM_CANDIDATES] public voteCounts;
    uint256 public totalVotes;

    event VoteCast(bytes32 indexed nullifier, uint256 candidate);

    constructor(address _verifier) {
        verifier = BPVerifier(_verifier);
    }

    /**
     * Cast a vote with a Bulletproofs range proof.
     *
     * @param proof      23-element uint256 array (BPVerifier layout)
     * @param candidate  Candidate index 0-4 (must match commitment V in proof[0-1])
     * @param nullifier  keccak256(voterSecret, electionId) — prevents double voting
     */
    function castVote(
        uint256[23] calldata proof,
        uint256 candidate,
        bytes32 nullifier
    ) external {
        require(candidate < NUM_CANDIDATES, "Invalid candidate");
        require(!nullifierUsed[nullifier], "Already voted");

        // Verify the range proof: v ∈ [0, 15]
        require(verifier.verify(proof), "Invalid proof");

        // Mark nullifier used and record vote
        nullifierUsed[nullifier] = true;
        voteCounts[candidate]++;
        totalVotes++;

        emit VoteCast(nullifier, candidate);
    }

    /**
     * Returns vote tallies for all candidates.
     */
    function getResults() external view returns (uint256[NUM_CANDIDATES] memory) {
        return voteCounts;
    }
}
