import { config } from "dotenv";
config(); // Load environment variables from .env file

import { ethers } from "hardhat";
import { Election } from "../typechain-types";

interface VoteMetrics {
  voterIndex: number;
  voterAddress: string;
  gasUsed: bigint;
  gasPrice: bigint;
  totalCostWei: bigint;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
}

interface PerformanceResults {
  totalVoters: number;
  totalVotes: number;
  averageGasPerVote: bigint;
  totalGasUsed: bigint;
  totalCostWei: bigint;
  averageLatencyMs: number;
  throughputVps: number; // votes per second
  blockRange: {
    startBlock: number;
    endBlock: number;
    blockCount: number;
  };
  timeRange: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
  individualVotes: VoteMetrics[];
}

class VotingPerformanceAnalyzer {
  private provider: ethers.JsonRpcProvider;
  private accounts: ethers.Wallet[];

  constructor(provider: ethers.JsonRpcProvider, accounts: ethers.Wallet[]) {
    this.provider = provider;
    this.accounts = accounts;
  }

  async runPerformanceTest(voterCount: number): Promise<PerformanceResults> {
    console.log(`\n🚀 Starting Performance Test with ${voterCount} voters`);
    console.log("=".repeat(60));

    // Deploy election
    const electionAddress = await this.deployElection();
    console.log(`✅ Election deployed at: ${electionAddress}`);

    // Register voters
    const voters = this.accounts.slice(0, voterCount);
    await this.registerVoters(electionAddress, voters);
    console.log(`✅ Registered ${voters.length} voters`);

    // Send votes and collect metrics
    const voteMetrics = await this.sendVotesAndMeasure(electionAddress, voters);
    console.log(`✅ Collected ${voteMetrics.length} vote transactions`);

    // Calculate performance metrics
    const results = await this.calculatePerformanceMetrics(voteMetrics, voterCount);

    return results;
  }

  private async deployElection(): Promise<string> {
    const admin = this.accounts[0]; // Use first account as admin
    const ElectionFactory = await ethers.getContractFactory("Election", admin);

    const candidates = ["Alice Johnson", "Bob Smith", "Charlie Brown"];
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime + 10; // Start in 10 seconds
    const endTime = startTime + 3600; // End in 1 hour

    const election = await ElectionFactory.deploy(candidates, startTime, endTime);
    await election.waitForDeployment();

    return await election.getAddress();
  }

  private async registerVoters(electionAddress: string, voters: ethers.Wallet[]): Promise<void> {
    const admin = this.accounts[0];
    const election = await ethers.getContractAt("Election", electionAddress, admin);

    const voterAddresses = voters.map(v => v.address);

    // Register voters in batches to avoid gas limits
    const batchSize = 50;
    for (let i = 0; i < voterAddresses.length; i += batchSize) {
      const batch = voterAddresses.slice(i, i + batchSize);
      await election.batchRegisterVoters(batch);
    }
  }

  private async sendVotesAndMeasure(electionAddress: string, voters: ethers.Wallet[]): Promise<VoteMetrics[]> {
    const metrics: VoteMetrics[] = [];
    const election = await ethers.getContractAt("Election", electionAddress);

    console.log("\n📊 Sending votes and measuring performance...");

    // Send votes sequentially to measure individual performance
    for (let i = 0; i < voters.length; i++) {
      const voter = voters[i];
      const electionWithVoter = election.connect(voter);

      console.log(`   Voting ${i + 1}/${voters.length} - ${voter.address.slice(0, 10)}...`);

      try {
        // Random candidate selection (0, 1, or 2)
        const candidateId = Math.floor(Math.random() * 3);

        const tx = await electionWithVoter.vote(candidateId);
        const receipt = await tx.wait();

        if (!receipt) {
          throw new Error(`Transaction failed for voter ${i}`);
        }

        // Get block details
        const block = await this.provider.getBlock(receipt.blockNumber);

        const voteMetric: VoteMetrics = {
          voterIndex: i,
          voterAddress: voter.address,
          gasUsed: receipt.gasUsed,
          gasPrice: receipt.gasPrice || 0n,
          totalCostWei: receipt.gasUsed * (receipt.gasPrice || 0n),
          blockNumber: receipt.blockNumber,
          timestamp: block?.timestamp || 0,
          transactionHash: receipt.hash
        };

        metrics.push(voteMetric);

        // Small delay between votes to avoid overwhelming the network
        if (i < voters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`❌ Vote failed for voter ${i} (${voter.address}):`, error);
        // Continue with next voter
      }
    }

    return metrics;
  }

  private async calculatePerformanceMetrics(voteMetrics: VoteMetrics[], totalVoters: number): Promise<PerformanceResults> {
    if (voteMetrics.length === 0) {
      throw new Error("No successful votes to analyze");
    }

    // Calculate gas metrics
    const totalGasUsed = voteMetrics.reduce((sum, m) => sum + m.gasUsed, 0n);
    const averageGasPerVote = totalGasUsed / BigInt(voteMetrics.length);
    const totalCostWei = voteMetrics.reduce((sum, m) => sum + m.totalCostWei, 0n);

    // Calculate time metrics
    const sortedByTime = voteMetrics.sort((a, b) => a.timestamp - b.timestamp);
    const startTime = sortedByTime[0].timestamp;
    const endTime = sortedByTime[sortedByTime.length - 1].timestamp;
    const durationMs = (endTime - startTime) * 1000;

    // Calculate block range
    const blockNumbers = voteMetrics.map(m => m.blockNumber);
    const startBlock = Math.min(...blockNumbers);
    const endBlock = Math.max(...blockNumbers);
    const blockCount = endBlock - startBlock + 1;

    // Calculate latency (average time between votes)
    const averageLatencyMs = durationMs / (voteMetrics.length - 1);

    // Calculate throughput (votes per second)
    const throughputVps = voteMetrics.length / (durationMs / 1000);

    return {
      totalVoters,
      totalVotes: voteMetrics.length,
      averageGasPerVote,
      totalGasUsed,
      totalCostWei,
      averageLatencyMs,
      throughputVps,
      blockRange: {
        startBlock,
        endBlock,
        blockCount
      },
      timeRange: {
        startTime,
        endTime,
        durationMs
      },
      individualVotes: voteMetrics
    };
  }

  static formatResults(results: PerformanceResults): string {
    const ethCost = Number(ethers.formatEther(results.totalCostWei));

    return `
🎯 PERFORMANCE TEST RESULTS (${results.totalVoters} voters)
${"=".repeat(60)}

📊 GAS METRICS:
   • Average gas per vote: ${results.averageGasPerVote.toLocaleString()}
   • Total gas used: ${results.totalGasUsed.toLocaleString()}
   • Total cost: ${ethCost.toFixed(6)} ETH

⏱️  LATENCY & THROUGHPUT:
   • Average latency: ${results.averageLatencyMs.toFixed(2)} ms
   • Throughput: ${results.throughputVps.toFixed(2)} votes/second
   • Duration: ${(results.timeRange.durationMs / 1000).toFixed(2)} seconds

📦 BLOCKCHAIN METRICS:
   • Block range: ${results.blockRange.startBlock} → ${results.blockRange.endBlock}
   • Blocks used: ${results.blockRange.blockCount}
   • Success rate: ${((results.totalVotes / results.totalVoters) * 100).toFixed(1)}%

📝 INDIVIDUAL VOTES (${results.individualVotes.length}):
${results.individualVotes.map((v, i) =>
  `   ${i + 1}. Voter ${v.voterIndex}: ${v.gasUsed.toLocaleString()} gas, Block ${v.blockNumber}, ${new Date(v.timestamp * 1000).toISOString()}`
).join('\n')}

💡 ANALYSIS:
   • Gas efficiency: ${results.averageGasPerVote < 50000n ? 'EXCELLENT' : results.averageGasPerVote < 100000n ? 'GOOD' : 'NEEDS OPTIMIZATION'}
   • Network throughput: ${results.throughputVps > 10 ? 'HIGH' : results.throughputVps > 5 ? 'MODERATE' : 'LOW'}
   • Scalability: ${results.totalVotes === results.totalVoters ? 'PERFECT' : 'ISSUES DETECTED'}
`;
  }
}

async function main() {
  const testScenarios = [10, 100, 1000]; // Small, medium, large scale tests

  // Setup provider and accounts
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "http://localhost:8545");

  // Create multiple test accounts
  const baseWallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  const accounts: ethers.Wallet[] = [baseWallet];

  // Generate additional accounts for large-scale testing
  for (let i = 1; i < 1000; i++) {
    const wallet = ethers.Wallet.createRandom().connect(provider);
    // Fund the wallet with some ETH from base account (simplified - in practice you'd need proper funding)
    accounts.push(wallet);
  }

  const analyzer = new VotingPerformanceAnalyzer(provider, accounts);

  console.log("🧪 BLOCKCHAIN VOTING SYSTEM - PERFORMANCE ANALYSIS");
  console.log("Network:", process.env.SEPOLIA_RPC_URL?.includes('sepolia') ? 'Sepolia Testnet' : 'Local Hardhat');
  console.log("Test Scenarios:", testScenarios.join(', '));

  const allResults: PerformanceResults[] = [];

  for (const voterCount of testScenarios) {
    try {
      // Check if we have enough accounts
      if (accounts.length < voterCount) {
        console.log(`⚠️  Skipping ${voterCount} voter test - only ${accounts.length} accounts available`);
        continue;
      }

      const results = await analyzer.runPerformanceTest(voterCount);
      allResults.push(results);

      console.log(VotingPerformanceAnalyzer.formatResults(results));

    } catch (error) {
      console.error(`❌ Test failed for ${voterCount} voters:`, error);
    }
  }

  // Summary comparison
  if (allResults.length > 1) {
    console.log("\n📈 COMPARATIVE ANALYSIS");
    console.log("=".repeat(60));

    allResults.forEach(result => {
      console.log(`${result.totalVoters} voters: ${result.averageGasPerVote.toLocaleString()} avg gas, ${result.throughputVps.toFixed(2)} vps, ${(result.timeRange.durationMs / 1000).toFixed(2)}s`);
    });
  }

  console.log("\n✅ Performance analysis complete!");
}

// We recommend this pattern to be able to use async/await everywhere
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
