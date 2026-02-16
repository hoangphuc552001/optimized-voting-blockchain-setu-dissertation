import {ethers, Signer} from 'ethers';
import {Election, Election__factory} from '../../typechain-types';

export interface ElectionStatus {
  admin: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  totalCandidates: number;
  timeUntilStart?: number;
  timeUntilEnd?: number;
}

export interface ElectionResults {
  candidates: Array<{
    id: number;
    name: string;
    voteCount: number;
  }>;
  totalVotes: number;
}

export interface WinnerInfo {
  id: number;
  name: string;
  voteCount: number;
}

export class ElectionService {
  private signer: Signer;

  constructor(signer: Signer) {
    this.signer = signer;
  }

  async deployElection(candidates: string[], startTime: number, endTime: number): Promise<string> {
    // Try to use hardhat ethers first, fallback to standard ethers if not available
    let ethersLib: any;
    try {
      console.log('Using Hardhat ethers for deployment');
      ethersLib = await import('hardhat');
    } catch {
        console.log('Using standard ethers for deployment');
      ethersLib = ethers;
    }

    const ElectionFactory = await ethersLib.ethers.getContractFactory("Election", this.signer);
    const election = await ElectionFactory.deploy(candidates, startTime, endTime);
    await election.waitForDeployment();

    return await election.getAddress();
  }

  async getElectionContract(address: string): Promise<Election> {
    return Election__factory.connect(address, this.signer);
  }

  async getElectionStatus(address: string): Promise<ElectionStatus> {
    const election = await this.getElectionContract(address);

    const [startTime, endTime, isActive, totalCandidates] = await election.getElectionStatus();
    const admin = await election.admin();

    const currentTime = Math.floor(Date.now() / 1000);
    const startTimeNum = Number(startTime);
    const endTimeNum = Number(endTime);

    let timeUntilStart: number | undefined;
    let timeUntilEnd: number | undefined;

    if (currentTime < startTimeNum) {
      timeUntilStart = startTimeNum - currentTime;
    } else if (currentTime <= endTimeNum) {
      timeUntilEnd = endTimeNum - currentTime;
    }

    return {
      admin,
      startTime: startTimeNum,
      endTime: endTimeNum,
      isActive,
      totalCandidates: Number(totalCandidates),
      timeUntilStart,
      timeUntilEnd,
    };
  }

  async getElectionResults(address: string): Promise<ElectionResults> {
    const election = await this.getElectionContract(address);
    const candidatesCount = await election.getCandidatesCount();

    const candidates = [];
    let totalVotes = 0;

    for (let i = 0; i < candidatesCount; i++) {
      const [name, voteCount] = await election.getCandidate(i);
      const voteCountNum = Number(voteCount);
      candidates.push({
        id: i,
        name,
        voteCount: voteCountNum,
      });
      totalVotes += voteCountNum;
    }

    return {
      candidates,
      totalVotes,
    };
  }

  async getWinner(address: string): Promise<WinnerInfo> {
    const election = await this.getElectionContract(address);
    const [winnerId, winnerName, winnerVotes] = await election.getWinner();

    return {
      id: Number(winnerId),
      name: winnerName,
      voteCount: Number(winnerVotes),
    };
  }

  async registerVoters(electionAddress: string, voterAddresses: string[]): Promise<void> {
    const election = await this.getElectionContract(electionAddress);

    // Filter out invalid addresses and already registered voters
    const validVoters = [];
    for (const voterAddress of voterAddresses) {
      if (ethers.isAddress(voterAddress)) {
        const isRegistered = await election.isRegisteredVoter(voterAddress);
        if (!isRegistered) {
          validVoters.push(voterAddress);
        }
      }
    }

    if (validVoters.length > 0) {
      const tx = await election.batchRegisterVoters(validVoters);
      await tx.wait();
    }
  }

  async isVoterRegistered(electionAddress: string, voterAddress: string): Promise<boolean> {
    const election = await this.getElectionContract(electionAddress);
    return await election.isRegisteredVoter(voterAddress);
  }

  async castVote(electionAddress: string, voterAddress: string, candidateId: number): Promise<string> {
    // TESTING ONLY: Use adminVoteFor function to vote on behalf of registered voters
    // In production, this should NEVER be done!
    const election = await this.getElectionContract(electionAddress);

    // Check if the voter is registered and hasn't voted (same checks as before)
    const isRegistered = await election.isRegisteredVoter(voterAddress);
    if (!isRegistered) {
      throw new Error('Voter is not registered');
    }

    const hasVoted = await election.hasVoted(voterAddress);
    if (hasVoted) {
      throw new Error('Voter has already voted');
    }

    // Use adminVoteFor function - admin (this.signer) votes on behalf of the voter
    const electionWithAdmin = election.connect(this.signer);
    const tx = await electionWithAdmin.adminVoteFor(voterAddress, candidateId);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error('Transaction failed - no receipt received');
    }

    console.log(`Admin voted for ${voterAddress} on candidate ${candidateId}`);
    return receipt.hash;
  }

  async getVoteEvents(electionAddress: string, fromBlock?: number): Promise<any[]> {
    const election = await this.getElectionContract(electionAddress);

    const filter = election.filters.VoteCast();
    const events = await election.queryFilter(filter, fromBlock);

    return events.map(event => ({
      voter: event.args?.voter,
      candidateId: event.args?.candidateId,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
    }));
  }

  async getVoterRegistrationEvents(electionAddress: string, fromBlock?: number): Promise<any[]> {
    const election = await this.getElectionContract(electionAddress);

    const filter = election.filters.VoterRegistered();
    const events = await election.queryFilter(filter, fromBlock);

    return events.map(event => ({
      voter: event.args?.voter,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
    }));
  }
}
