// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface IVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}


contract BallotBox {
    IVerifier public verifier;
    
    // Merkle root of eligible voters - stored upon deployment
    uint256 public merkleRoot;
    
    // Election identifier to prevent cross-election voting
    uint256 public electionId;
    
    // Track used nullifiers to prevent double voting
    mapping(uint256 => bool) public nullifierHashes;
    
    event BallotAccepted(uint256 indexed nullifierHash, uint256 indexed ballotHash);
    
    event DuplicateBallotRejected(uint256 indexed nullifierHash);

    event MerkleRootSet(uint256 indexed merkleRoot);
    
    uint256 public ballotCount;
    
    uint256 public constant NUM_CANDIDATES = 5;
    

    constructor(address _verifier, uint256 _merkleRoot, uint256 _electionId) {
        require(_verifier != address(0), "Verifier address cannot be zero");
        verifier = IVerifier(_verifier);
        merkleRoot = _merkleRoot;
        electionId = _electionId;
        ballotCount = 0;
    }

    function setMerkleRoot(uint256 _merkleRoot) public {
        merkleRoot = _merkleRoot;
        emit MerkleRootSet(_merkleRoot);
    }

    function submitBallot(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) public {
        // Input array format from circuit: [merkleRoot, candidate, vote, salt, ballotHash]
        uint256 inputMerkleRoot = input[0];
        uint256 candidate = input[1];
        uint256 vote = input[2];
        uint256 salt = input[3];
        uint256 ballotHash = input[4];
        
        // Use ballotHash as nullifier for double-voting prevention
        uint256 nullifierHash = ballotHash;

        // Verify the Merkle root matches
        require(inputMerkleRoot == merkleRoot, "Invalid Merkle root");

        // Verify the ZK proof
        require(
            verifier.verifyProof(a, b, c, input),
            "Invalid ZK proof"
        );

        // Check for double voting (nullifier reuse)
        if (nullifierHashes[nullifierHash]) {
            emit DuplicateBallotRejected(nullifierHash);
            revert("Ballot already submitted (nullifier already used)");
        }
        
        // Record the nullifier to prevent double voting
        nullifierHashes[nullifierHash] = true;
        ballotCount++;
        
        emit BallotAccepted(nullifierHash, ballotHash);
    }

    function submitBallotAllowDuplicates(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) public {
        // Input array format: [merkleRoot, nullifierHash, ballotHash, electionId, ballotHashForVerifier]
        uint256 inputMerkleRoot = input[0];
        uint256 ballotHash = input[2];
        uint256 inputElectionId = input[3];

        // Verify the Merkle root matches
        require(inputMerkleRoot == merkleRoot, "Invalid Merkle root");

        // Verify the election ID matches
        require(inputElectionId == electionId, "Invalid election ID");
        
        require(
            verifier.verifyProof(a, b, c, input),
            "Invalid ZK proof"
        );
        
        ballotCount++;
        
        emit BallotAccepted(input[1], ballotHash);
    }

    function hasSubmitted(uint256 nullifierHash) public view returns (bool) {
        return nullifierHashes[nullifierHash];
    }

    function getVerifierAddress() public view returns (address) {
        return address(verifier);
    }
}
