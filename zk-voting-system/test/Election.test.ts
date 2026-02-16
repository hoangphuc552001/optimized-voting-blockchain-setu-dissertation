import { expect } from "chai";
import { ethers } from "hardhat";
import { Election } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Election", function () {
  let election: Election;
  let admin: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;
  let voter3: SignerWithAddress;
  let nonVoter: SignerWithAddress;

  const candidateNames = ["Alice", "Bob", "Charlie"];
  let startTime: number;
  let endTime: number;

  beforeEach(async function () {
    [admin, voter1, voter2, voter3, nonVoter] = await ethers.getSigners();

    // Set voting period: starts in 1 hour, ends in 2 hours
    const currentTime = await time.latest();
    startTime = currentTime + 3600; // 1 hour from now
    endTime = currentTime + 7200; // 2 hours from now

    const ElectionFactory = await ethers.getContractFactory("Election");
    election = await ElectionFactory.deploy(candidateNames, startTime, endTime);
    await election.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right admin", async function () {
      expect(await election.admin()).to.equal(admin.address);
    });

    it("Should initialize candidates correctly", async function () {
      expect(await election.getCandidatesCount()).to.equal(3);

      const [name1] = await election.getCandidate(0);
      const [name2] = await election.getCandidate(1);
      const [name3] = await election.getCandidate(2);

      expect(name1).to.equal("Alice");
      expect(name2).to.equal("Bob");
      expect(name3).to.equal("Charlie");
    });

    it("Should set voting times correctly", async function () {
      expect(await election.startTime()).to.equal(startTime);
      expect(await election.endTime()).to.equal(endTime);
    });

    it("Should emit ElectionCreated event", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      const tx = ElectionFactory.getDeployTransaction(candidateNames, startTime, endTime);

      await expect(election.deploymentTransaction())
        .to.emit(election, "ElectionCreated")
        .withArgs(candidateNames, startTime, endTime);
    });

    it("Should reject deployment with empty candidates", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      await expect(ElectionFactory.deploy([], startTime, endTime))
        .to.be.revertedWith("At least one candidate required");
    });

    it("Should reject deployment with invalid times", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      const currentTime = await time.latest();
      await expect(ElectionFactory.deploy(candidateNames, endTime, startTime))
        .to.be.revertedWith("Start time must be before end time");
    });

  });

  describe("Voter Registration", function () {
    it("Should allow admin to register voters", async function () {
      await expect(election.registerVoter(voter1.address))
        .to.emit(election, "VoterRegistered")
        .withArgs(voter1.address);

      expect(await election.isRegisteredVoter(voter1.address)).to.be.true;
    });

    it("Should allow batch registration of voters", async function () {
      const voters = [voter1.address, voter2.address, voter3.address];

      await expect(election.batchRegisterVoters(voters))
        .to.emit(election, "VoterRegistered")
        .withArgs(voter1.address)
        .and.to.emit(election, "VoterRegistered")
        .withArgs(voter2.address)
        .and.to.emit(election, "VoterRegistered")
        .withArgs(voter3.address);

      expect(await election.isRegisteredVoter(voter1.address)).to.be.true;
      expect(await election.isRegisteredVoter(voter2.address)).to.be.true;
      expect(await election.isRegisteredVoter(voter3.address)).to.be.true;
    });

    it("Should prevent non-admin from registering voters", async function () {
      await expect(election.connect(voter1).registerVoter(voter2.address))
        .to.be.revertedWith("Only admin can call this function");
    });

    it("Should prevent registering zero address", async function () {
      await expect(election.registerVoter(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid voter address");
    });

    it("Should prevent duplicate registration", async function () {
      await election.registerVoter(voter1.address);
      await expect(election.registerVoter(voter1.address))
        .to.be.revertedWith("Voter already registered");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      // Register voters
      await election.registerVoter(voter1.address);
      await election.registerVoter(voter2.address);

      // Move to voting period
      await time.increaseTo(startTime + 1);
    });

    it("Should allow registered voters to vote", async function () {
      await expect(election.connect(voter1).vote(0))
        .to.emit(election, "VoteCast")
        .withArgs(voter1.address, 0);

      expect(await election.hasVoted(voter1.address)).to.be.true;
      const [, voteCount] = await election.getCandidate(0);
      expect(voteCount).to.equal(1);
    });

    it("Should prevent unregistered voters from voting", async function () {
      await expect(election.connect(nonVoter).vote(0))
        .to.be.revertedWith("Voter not registered");
    });

    it("Should prevent double voting", async function () {
      await election.connect(voter1).vote(0);
      await expect(election.connect(voter1).vote(1))
        .to.be.revertedWith("Voter has already voted");
    });

    it("Should prevent voting for invalid candidate", async function () {
      await expect(election.connect(voter1).vote(99))
        .to.be.revertedWith("Invalid candidate ID");
    });

    it("Should prevent voting before start time", async function () {
      // Deploy new election and don't advance time
      const currentTime = await time.latest();
      const newStartTime = currentTime + 3600;
      const newEndTime = currentTime + 7200;

      const ElectionFactory = await ethers.getContractFactory("Election");
      const newElection = await ElectionFactory.deploy(candidateNames, newStartTime, newEndTime);
      await newElection.waitForDeployment();

      await newElection.registerVoter(voter1.address);

      await expect(newElection.connect(voter1).vote(0))
        .to.be.revertedWith("Voting is not active");
    });

    it("Should prevent voting after end time", async function () {
      await time.increaseTo(endTime + 1);

      await expect(election.connect(voter2).vote(0))
        .to.be.revertedWith("Voting is not active");
    });
  });

  describe("Results and Winner", function () {
    beforeEach(async function () {
      // Register voters
      await election.registerVoter(voter1.address);
      await election.registerVoter(voter2.address);
      await election.registerVoter(voter3.address);

      // Move to voting period
      await time.increaseTo(startTime + 1);

      // Cast votes
      await election.connect(voter1).vote(0); // Alice
      await election.connect(voter2).vote(1); // Bob
      await election.connect(voter3).vote(0); // Alice

      // Move past end time
      await time.increaseTo(endTime + 1);
    });

    it("Should return correct winner", async function () {
      const [winnerId, winnerName, winnerVotes] = await election.getWinner();

      expect(winnerId).to.equal(0); // Alice should win
      expect(winnerName).to.equal("Alice");
      expect(winnerVotes).to.equal(2);
    });

    it("Should prevent getting winner during active election", async function () {
      // Create new election
      const currentTime = await time.latest();
      const newStartTime = currentTime + 3600;
      const newEndTime = currentTime + 7200;

      const ElectionFactory = await ethers.getContractFactory("Election");
      const newElection = await ElectionFactory.deploy(candidateNames, newStartTime, newEndTime);
      await newElection.waitForDeployment();

      await expect(newElection.getWinner())
        .to.be.revertedWith("Election is still active");
    });

    it("Should return correct candidate information", async function () {
      const [name0, votes0] = await election.getCandidate(0);
      const [name1, votes1] = await election.getCandidate(1);
      const [name2, votes2] = await election.getCandidate(2);

      expect(name0).to.equal("Alice");
      expect(votes0).to.equal(2);
      expect(name1).to.equal("Bob");
      expect(votes1).to.equal(1);
      expect(name2).to.equal("Charlie");
      expect(votes2).to.equal(0);
    });
  });

  describe("Election Status", function () {
    it("Should return correct election status", async function () {
      const [start, end, isActive, totalCandidates] = await election.getElectionStatus();

      expect(start).to.equal(startTime);
      expect(end).to.equal(endTime);
      expect(totalCandidates).to.equal(3);

      // Should not be active initially
      expect(isActive).to.be.false;

      // Move to voting period
      await time.increaseTo(startTime + 1);
      const [, , isActiveDuring] = await election.getElectionStatus();
      expect(isActiveDuring).to.be.true;

      // Move past end time
      await time.increaseTo(endTime + 1);
      const [, , isActiveAfter] = await election.getElectionStatus();
      expect(isActiveAfter).to.be.false;
    });
  });
});
