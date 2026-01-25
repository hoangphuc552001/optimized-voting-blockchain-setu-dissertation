import { config } from "dotenv";
config(); // Load environment variables from .env file

import { ethers } from "hardhat";

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
    const startTime = currentTime - 60; // Start 1 minute ago (already active)
    const endTime = startTime + 3600; // End in 1 hour from start

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
      console.log(`   Registering batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(voterAddresses.length / batchSize)} (${batch.length} voters)`);
      await election.batchRegisterVoters(batch);

      // Delay between batches to avoid nonce conflicts
      if (i + batchSize < voterAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
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
          timestamp: Math.floor(Date.now() / 1000),
          transactionHash: receipt.hash
        };

        metrics.push(voteMetric);

        // Further increased delay between votes to avoid nonce conflicts
        if (i < voters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
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
  const testScenarios = [50, 100, 500]; // Performance test scenarios

  // Setup provider
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "http://localhost:8545");

  // Use a consistent Hardhat account that gets reset with the network
  const baseWallet = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);

  console.log("🧪 BLOCKCHAIN VOTING SYSTEM - PERFORMANCE ANALYSIS");
  console.log("Network:", process.env.SEPOLIA_RPC_URL?.includes('sepolia') ? 'Sepolia Testnet' : 'Local Hardhat');
  console.log("Test Scenarios:", testScenarios.join(', '));

  const allResults: PerformanceResults[] = [];

  for (const voterCount of testScenarios) {
    try {
      console.log(`\n🔄 Preparing fresh accounts for ${voterCount} voters...`);

      // Use pre-funded Hardhat accounts to avoid funding issues
      // Hardhat provides 20 accounts with 10,000 ETH each by default
      const allSigners = await ethers.getSigners();
      const accounts = allSigners.slice(0, voterCount + 1); // +1 for admin

      console.log(`✅ Using ${accounts.length} pre-funded Hardhat accounts (${voterCount} voters + 1 admin)`);
      console.log(`   Admin: ${accounts[0].address.slice(0, 10)}... (balance: ${(await provider.getBalance(accounts[0].address)) / ethers.parseEther("1")} ETH)`);
      console.log(`   First voter: ${accounts[1].address.slice(0, 10)}... (balance: ${(await provider.getBalance(accounts[1].address)) / ethers.parseEther("1")} ETH)`);

      // Wait for network to settle before starting test
      console.log("⏳ Waiting for network to settle...");
      await new Promise(resolve => setTimeout(resolve, 5000));

      const analyzer = new VotingPerformanceAnalyzer(provider, accounts);
      const results = await analyzer.runPerformanceTest(voterCount);
      allResults.push(results);

      console.log(VotingPerformanceAnalyzer.formatResults(results));

      // Delay between test scenarios to let network settle
      if (voterCount !== testScenarios[testScenarios.length - 1]) {
        console.log("⏳ Waiting 10 seconds before next test scenario...");
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

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
