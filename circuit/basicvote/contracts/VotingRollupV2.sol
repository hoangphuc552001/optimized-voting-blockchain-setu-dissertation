// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IVoteVerifier
 * @dev Interface for the Layer 1 individual vote proof verifier (VoteProof circuit)
 * Public signals: [nullifierHash, candidate, vote, voterMerkleRoot, electionId]
 */
interface IVoteVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external view returns (bool);
}

/**
 * @title IBatchStateVerifier
 * @dev Interface for the Layer 2 batch state transition verifier (BatchStateUpdate circuit)
 * Public signals: [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]
 */
interface IBatchStateVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external view returns (bool);
}

/**
 * @title VotingRollupV2
 * @dev Two-layer ZK rollup voting contract
 *
 * Architecture:
 * - Layer 1: Each voter generates an individual ZK proof (VoteProof) client-side
 *   proving eligibility WITHOUT revealing their secret
 * - Layer 2: Operator batches verified votes into a state transition proof (BatchStateUpdate)
 *   proving the state tree was updated correctly
 *
 * Privacy improvement: The operator NEVER sees voter secrets.
 * They see (candidate, vote) but cannot link them to voter identities.
 */
contract VotingRollupV2 {
    IVoteVerifier public voteVerifier;
    IBatchStateVerifier public batchVerifier;

    uint256 public stateRoot;
    uint256 public voterMerkleRoot;
    uint256 public electionId;

    uint256 public batchCount;

    mapping(uint256 => bool) public nullifiers;

    bool public votingActive;

    address public admin;

    // How many individual proofs to spot-check on-chain per batch
    uint256 public spotCheckCount;

    event BatchSubmitted(
        uint256 indexed batchIndex,
        uint256 preStateRoot,
        uint256 postStateRoot,
        uint256 voteCount
    );

    event VotingStarted(uint256 electionId);
    event VotingEnded(uint256 electionId, uint256 finalStateRoot, uint256 totalBatches);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyDuringVoting() {
        require(votingActive, "Voting not active");
        _;
    }

    /**
     * @param _voteVerifier Address of the Layer 1 VoteProof verifier contract
     * @param _batchVerifier Address of the Layer 2 BatchStateUpdate verifier contract
     * @param _initialStateRoot Initial state root (empty tally tree)
     * @param _voterMerkleRoot Root of the voter eligibility Merkle tree
     * @param _electionId Election identifier
     * @param _spotCheckCount Number of individual proofs to verify on-chain per batch (0 = skip)
     */
    constructor(
        address _voteVerifier,
        address _batchVerifier,
        uint256 _initialStateRoot,
        uint256 _voterMerkleRoot,
        uint256 _electionId,
        uint256 _spotCheckCount
    ) {
        require(_voteVerifier != address(0), "VoteVerifier address cannot be zero");
        require(_batchVerifier != address(0), "BatchVerifier address cannot be zero");

        voteVerifier = IVoteVerifier(_voteVerifier);
        batchVerifier = IBatchStateVerifier(_batchVerifier);
        stateRoot = _initialStateRoot;
        voterMerkleRoot = _voterMerkleRoot;
        electionId = _electionId;
        spotCheckCount = _spotCheckCount;
        votingActive = true;
        admin = msg.sender;
        batchCount = 0;

        emit VotingStarted(_electionId);
    }

    /**
     * @dev Submit a batch of votes with two-layer proof verification
     * @param batchA Batch proof point A
     * @param batchB Batch proof point B
     * @param batchC Batch proof point C
     * @param newStateRoot The new state root after applying all votes
     * @param batchNullifierHash Poseidon hash commitment of all nullifiers in the batch
     * @param nullifierList Array of individual nullifier hashes for L1 tracking
     * @param voteProofsA Array of individual vote proof A points (for spot-checking)
     * @param voteProofsB Array of individual vote proof B points (for spot-checking)
     * @param voteProofsC Array of individual vote proof C points (for spot-checking)
     * @param votePublicSignals Array of individual proof public signals [nullifier, candidate, vote, merkleRoot, electionId]
     */
    function submitBatch(
        uint256[2] calldata batchA,
        uint256[2][2] calldata batchB,
        uint256[2] calldata batchC,
        uint256 newStateRoot,
        uint256 batchNullifierHash,
        uint256[] calldata nullifierList,
        uint256[2][] calldata voteProofsA,
        uint256[2][2][] calldata voteProofsB,
        uint256[2][] calldata voteProofsC,
        uint256[5][] calldata votePublicSignals
    ) external onlyDuringVoting {
        // Step 1: Verify the batch state transition proof (Layer 2)
        _verifyBatchProof(batchA, batchB, batchC, newStateRoot, batchNullifierHash);

        // Step 2: Spot-check individual vote proofs on-chain (Layer 1)
        _spotCheckVoteProofs(voteProofsA, voteProofsB, voteProofsC, votePublicSignals);

        // Step 3: Register nullifiers on L1 (prevents cross-batch double voting)
        for (uint256 i = 0; i < nullifierList.length; i++) {
            require(!nullifiers[nullifierList[i]], "Duplicate nullifier");
            nullifiers[nullifierList[i]] = true;
        }

        emit BatchSubmitted(batchCount, stateRoot, newStateRoot, nullifierList.length);

        stateRoot = newStateRoot;
        batchCount++;
    }

    function _verifyBatchProof(
        uint256[2] calldata batchA,
        uint256[2][2] calldata batchB,
        uint256[2] calldata batchC,
        uint256 newStateRoot,
        uint256 batchNullifierHash
    ) internal view {
        uint256[4] memory batchPublicInputs = [
            stateRoot,
            newStateRoot,
            batchNullifierHash,
            voterMerkleRoot
        ];

        require(
            batchVerifier.verifyProof(batchA, batchB, batchC, batchPublicInputs),
            "Invalid batch state proof"
        );
    }

    function _spotCheckVoteProofs(
        uint256[2][] calldata voteProofsA,
        uint256[2][2][] calldata voteProofsB,
        uint256[2][] calldata voteProofsC,
        uint256[5][] calldata votePublicSignals
    ) internal view {
        uint256 checksToPerform = spotCheckCount;
        if (checksToPerform > voteProofsA.length) {
            checksToPerform = voteProofsA.length;
        }

        for (uint256 i = 0; i < checksToPerform; i++) {
            require(
                voteVerifier.verifyProof(
                    voteProofsA[i],
                    voteProofsB[i],
                    voteProofsC[i],
                    votePublicSignals[i]
                ),
                "Invalid individual vote proof"
            );

            // Verify the individual proof's merkle root matches
            require(
                votePublicSignals[i][3] == voterMerkleRoot,
                "Vote proof merkle root mismatch"
            );

            // Verify the individual proof's election ID matches
            require(
                votePublicSignals[i][4] == electionId,
                "Vote proof election ID mismatch"
            );
        }
    }

    function endVoting() external onlyAdmin {
        require(votingActive, "Voting already ended");
        votingActive = false;
        emit VotingEnded(electionId, stateRoot, batchCount);
    }

    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return nullifiers[nullifierHash];
    }

    function getState() external view returns (
        uint256 _stateRoot,
        uint256 _voterMerkleRoot,
        uint256 _electionId,
        uint256 _batchCount,
        bool _votingActive
    ) {
        return (stateRoot, voterMerkleRoot, electionId, batchCount, votingActive);
    }
}
