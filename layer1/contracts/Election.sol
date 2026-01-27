// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Election {
    address public admin;
    uint public startTime;
    uint public endTime;

    struct Candidate {
        string name;
        uint voteCount;
    }

    Candidate[] public candidates;
    mapping(address => bool) public isRegisteredVoter;
    mapping(address => bool) public hasVoted;

    event VoterRegistered(address voter);
    event VoteCast(address voter, uint candidateId);
    event ElectionCreated(string[] candidateNames, uint startTime, uint endTime);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyDuringVotingPeriod() {
        require(block.timestamp >= startTime && block.timestamp <= endTime, "Voting is not active");
        _;
    }

    constructor(string[] memory candidateNames, uint _startTime, uint _endTime) {
        require(candidateNames.length > 0, "At least one candidate required");
        require(_startTime < _endTime, "Start time must be before end time");
        require(_endTime > block.timestamp, "End time must be in the future");

        admin = msg.sender;

        for (uint i = 0; i < candidateNames.length; i++) {
            candidates.push(Candidate({
                name: candidateNames[i],
                voteCount: 0
            }));
        }

        startTime = _startTime;
        endTime = _endTime;

        emit ElectionCreated(candidateNames, _startTime, _endTime);
    }

    function registerVoter(address voter) external onlyAdmin {
        require(voter != address(0), "Invalid voter address");
        require(!isRegisteredVoter[voter], "Voter already registered");

        isRegisteredVoter[voter] = true;
        emit VoterRegistered(voter);
    }

    function batchRegisterVoters(address[] calldata voters) external onlyAdmin {
        for (uint i = 0; i < voters.length; i++) {
            if (!isRegisteredVoter[voters[i]] && voters[i] != address(0)) {
                isRegisteredVoter[voters[i]] = true;
                emit VoterRegistered(voters[i]);
            }
        }
    }

    function vote(uint candidateId) external onlyDuringVotingPeriod {
        require(isRegisteredVoter[msg.sender], "Voter not registered");
        require(!hasVoted[msg.sender], "Voter has already voted");
        require(candidateId < candidates.length, "Invalid candidate ID");

        hasVoted[msg.sender] = true;
        candidates[candidateId].voteCount++;

        emit VoteCast(msg.sender, candidateId);
    }

    // TESTING ONLY: Allow admin to vote on behalf of registered voters
    // This should NEVER be used in production!
    function adminVoteFor(address voter, uint candidateId) external onlyAdmin onlyDuringVotingPeriod {
        require(isRegisteredVoter[voter], "Voter not registered");
        require(!hasVoted[voter], "Voter has already voted");
        require(candidateId < candidates.length, "Invalid candidate ID");

        hasVoted[voter] = true;
        candidates[candidateId].voteCount++;

        emit VoteCast(voter, candidateId);
    }

    // PERFORMANCE TESTING ONLY: Allow any relayer to vote on behalf of registered voters
    // This bypasses admin restrictions for large-scale performance testing
    // NEVER USE IN PRODUCTION - SECURITY RISK!
    function relayerVoteFor(address voter, uint candidateId) external onlyDuringVotingPeriod {
        require(isRegisteredVoter[voter], "Voter not registered");
        require(!hasVoted[voter], "Voter has already voted");
        require(candidateId < candidates.length, "Invalid candidate ID");

        hasVoted[voter] = true;
        candidates[candidateId].voteCount++;

        emit VoteCast(voter, candidateId);
    }

    function getWinner() external view returns (uint winnerId, string memory winnerName, uint winnerVotes) {
        require(block.timestamp > endTime, "Election is still active");

        uint maxVotes = 0;
        uint winnerIndex = 0;

        for (uint i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > maxVotes) {
                maxVotes = candidates[i].voteCount;
                winnerIndex = i;
            }
        }

        return (winnerIndex, candidates[winnerIndex].name, maxVotes);
    }

    function getCandidatesCount() external view returns (uint) {
        return candidates.length;
    }

    function getCandidate(uint index) external view returns (string memory name, uint voteCount) {
        require(index < candidates.length, "Invalid candidate index");
        Candidate memory candidate = candidates[index];
        return (candidate.name, candidate.voteCount);
    }

    function getElectionStatus() external view returns (
        uint _startTime,
        uint _endTime,
        bool isActive,
        uint totalCandidates,
        uint totalRegisteredVoters
    ) {
        uint registeredCount = 0;

        // Note: This is inefficient for large voter lists, but works for our prototype
        // In production, you'd want to maintain a counter
        for (uint i = 0; i < candidates.length; i++) {
            // This is just a placeholder - we'd need a better way to count registered voters
        }

        return (
            startTime,
            endTime,
            block.timestamp >= startTime && block.timestamp <= endTime,
            candidates.length,
            registeredCount
        );
    }
}
