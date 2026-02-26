// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface IVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) external view returns (bool);
}


contract BallotBox {
    IVerifier public verifier;
    
    event BallotAccepted(uint256 indexed ballotHash);
    
    event DuplicateBallotRejected(uint256 indexed ballotHash);

    mapping(uint256 => bool) public ballotHashes;
    
    uint256 public ballotCount;
    
    uint256 public constant NUM_CANDIDATES = 5;
    

    constructor(address _verifier) {
        require(_verifier != address(0), "Verifier address cannot be zero");
        verifier = IVerifier(_verifier);
        ballotCount = 0;
    }

    function submitBallot(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public {
        uint256 ballotHash = input[0];

        require(
            verifier.verifyProof(a, b, c, input),
            "Invalid ZK proof"
        );

        if (ballotHashes[ballotHash]) {
            emit DuplicateBallotRejected(ballotHash);
            revert("Ballot already submitted (exact duplicate)");
        }
        
        ballotHashes[ballotHash] = true;
        ballotCount++;
        
        emit BallotAccepted(ballotHash);
    }

    function submitBallotAllowDuplicates(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public {
        require(
            verifier.verifyProof(a, b, c, input),
            "Invalid ZK proof"
        );
        
        uint256 ballotHash = input[0];
        
        ballotCount++;
        
        emit BallotAccepted(ballotHash);
    }

    function hasSubmitted(uint256 ballotHash) public view returns (bool) {
        return ballotHashes[ballotHash];
    }

    function getVerifierAddress() public view returns (address) {
        return address(verifier);
    }
}
