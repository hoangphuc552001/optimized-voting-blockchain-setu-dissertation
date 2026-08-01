// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * DemoBaselines.sol — RQ3 comparators for the live demo
 *
 * These two contracts provide the "per-vote ZK" and "non-ZK" baselines that the
 * demo UI measures the ZK-rollup against, in a strictly apples-to-apples way:
 * all three paths (rollup / per-vote ZK / plain) use the same nullifier-registry
 * and tally storage pattern, so the only difference between them is *how much
 * verification work happens per vote on-chain*.
 *
 * PerVoteZKBallot deliberately reuses the SAME VoteProof Groth16 verifier that
 * the rollup spot-checks with, so the per-vote ZK bar measures exactly one
 * pairing check of the same circuit — not a different circuit's cost.
 */

interface IVoteProofVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external view returns (bool);
}

/**
 * @title PerVoteZKBallot
 * @dev Baseline A — every ballot triggers its own Groth16 verification on L1.
 *      This is the "no rollup, but still private" comparator.
 */
contract PerVoteZKBallot {
    IVoteProofVerifier public verifier;

    uint256 public voterMerkleRoot;
    uint256 public electionId;
    uint256 public ballotCount;

    mapping(uint256 => bool) public nullifiers;
    mapping(uint256 => uint256) public tally;

    event BallotAccepted(uint256 indexed nullifierHash, uint256 indexed candidate);

    constructor(address _verifier, uint256 _voterMerkleRoot, uint256 _electionId) {
        require(_verifier != address(0), "Verifier address cannot be zero");
        verifier = IVoteProofVerifier(_verifier);
        voterMerkleRoot = _voterMerkleRoot;
        electionId = _electionId;
    }

    /**
     * @param input [nullifierHash, candidate, vote, voterMerkleRoot, electionId]
     */
    function castBallot(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external {
        require(verifier.verifyProof(a, b, c, input), "Invalid vote proof");
        require(input[3] == voterMerkleRoot, "Vote proof merkle root mismatch");
        require(input[4] == electionId, "Vote proof election ID mismatch");
        require(!nullifiers[input[0]], "Duplicate nullifier");

        nullifiers[input[0]] = true;
        tally[input[1]] += input[2];
        ballotCount++;

        emit BallotAccepted(input[0], input[1]);
    }
}

/**
 * @title PlainBallot
 * @dev Baseline B — no zero-knowledge at all. The ballot is submitted in the
 *      clear; the chain only prevents double voting. Provides no privacy, and
 *      is the cheapest possible on-chain-per-vote design. This is the floor the
 *      rollup has to beat to be worth its complexity.
 */
contract PlainBallot {
    uint256 public electionId;
    uint256 public ballotCount;

    mapping(uint256 => bool) public voted;
    mapping(uint256 => uint256) public tally;

    event BallotAccepted(uint256 indexed voterId, uint256 indexed candidate);

    constructor(uint256 _electionId) {
        electionId = _electionId;
    }

    function castBallot(uint256 voterId, uint256 candidate, uint256 vote) external {
        require(!voted[voterId], "Duplicate voter");
        require(vote <= 1, "Vote must be 0 or 1");
        require(candidate < 5, "Candidate out of range");

        voted[voterId] = true;
        tally[candidate] += vote;
        ballotCount++;

        emit BallotAccepted(voterId, candidate);
    }
}
