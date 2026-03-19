// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBatchVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external view returns (bool);
}

contract VotingRollup {
    IBatchVerifier public verifier;

    uint256 public stateRoot;
    uint256 public voterMerkleRoot;
    uint256 public electionId;

    uint256 public batchCount;

    mapping(uint256 => bool) public nullifiers;

    bool public votingActive;

    address public admin;

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

    constructor(
        address _verifier,
        uint256 _initialStateRoot,
        uint256 _voterMerkleRoot,
        uint256 _electionId
    ) {
        require(_verifier != address(0), "Verifier address cannot be zero");
        verifier = IBatchVerifier(_verifier);
        stateRoot = _initialStateRoot;
        voterMerkleRoot = _voterMerkleRoot;
        electionId = _electionId;
        votingActive = true;
        admin = msg.sender;
        batchCount = 0;

        emit VotingStarted(_electionId);
    }

    function submitBatch(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256 newStateRoot,
        uint256 batchNullifierHash,
        uint256[] calldata nullifierList
    ) external onlyDuringVoting {
        uint256[4] memory publicInputs = [
            stateRoot,
            newStateRoot,
            batchNullifierHash,
            voterMerkleRoot
        ];

        require(
            verifier.verifyProof(a, b, c, publicInputs),
            "Invalid batch proof"
        );

        for (uint256 i = 0; i < nullifierList.length; i++) {
            require(!nullifiers[nullifierList[i]], "Duplicate nullifier");
            nullifiers[nullifierList[i]] = true;
        }

        emit BatchSubmitted(batchCount, stateRoot, newStateRoot, nullifierList.length);

        stateRoot = newStateRoot;
        batchCount++;
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
