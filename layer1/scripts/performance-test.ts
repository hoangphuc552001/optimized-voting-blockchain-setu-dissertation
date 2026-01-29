import { config } from "dotenv";
config(); // Load environment variables from .env file

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface VoteMetrics {
  voterIndex: number;
  voterAddress: string;
  gasUsed: bigint;
  gasPrice: bigint;
  totalCostWei: bigint;
  blockNumber: number;
  timestampMs: number; // milliseconds since epoch (Date.now())
  transactionIndex?: number;
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

interface BatchedVotingResults {
  totalVoters: number;
  totalVotes: number;
  totalTransactions: number;
  averageGasPerVote: bigint;
  averageGasPerTransaction: bigint;
  totalGasUsed: bigint;
  totalCostWei: bigint;
  averageLatencyMs: number;
  throughputVps: number;
  throughputTps: number; // transactions per second
  batchEfficiency: number; // votes per transaction
  relayerUtilization: number; // percentage of relayers used
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
  transactionMetrics: VoteMetrics[];
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
          totalCostWei: (receipt.gasUsed * (receipt.gasPrice || 0n)) as unknown as bigint,
          blockNumber: receipt.blockNumber,
          timestampMs: Date.now(),
          transactionIndex: typeof (receipt as any).transactionIndex === 'number' ? (receipt as any).transactionIndex : undefined,
          transactionHash: receipt.hash
        };

        metrics.push(voteMetric);

        // Further increased delay between votes to avoid nonce conflicts
        if (i < voters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error: any) {
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

    // Calculate time metrics (timestamps are in milliseconds)
    const sortedByTime = voteMetrics.sort((a, b) => a.timestampMs - b.timestampMs);
    const startTime = sortedByTime[0].timestampMs;
    const endTime = sortedByTime[sortedByTime.length - 1].timestampMs;
    const durationMs = endTime - startTime;

    // Calculate block range
    const blockNumbers = voteMetrics.map(m => m.blockNumber);
    const startBlock = Math.min(...blockNumbers);
    const endBlock = Math.max(...blockNumbers);
    const blockCount = endBlock - startBlock + 1;

    // Calculate latency (average time between votes)
    const averageLatencyMs = durationMs / (voteMetrics.length - 1);

    // Calculate throughput (votes per second)
    const throughputVps = durationMs > 0 ? voteMetrics.length / (durationMs / 1000) : Infinity;

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
  `   ${i + 1}. Voter ${v.voterIndex}: ${v.gasUsed.toLocaleString()} gas, Block ${v.blockNumber}, ${new Date(v.timestampMs).toISOString()}`
).join('\n')}

💡 ANALYSIS:
   • Gas efficiency: ${results.averageGasPerVote < 50000n ? 'EXCELLENT' : results.averageGasPerVote < 100000n ? 'GOOD' : 'NEEDS OPTIMIZATION'}
   • Network throughput: ${results.throughputVps > 10 ? 'HIGH' : results.throughputVps > 5 ? 'MODERATE' : 'LOW'}
   • Scalability: ${results.totalVotes === results.totalVoters ? 'PERFECT' : 'ISSUES DETECTED'}
`;
  }

  async runBatchedVotingTest(voterAddresses: string[], totalVoters: number, existingElectionAddress?: string): Promise<BatchedVotingResults> {
    console.log(`\n🏭 Starting batched voting with ${voterAddresses.length} voters using ${this.accounts.length} relayers`);
    console.log("=".repeat(70));

    // Use existing election contract or deploy new one
    let electionAddress: string;
    if (existingElectionAddress) {
      electionAddress = existingElectionAddress;
      console.log(`✅ Using existing election contract: ${electionAddress}`);
    } else {
      electionAddress = await this.deployElectionForBatch();
      console.log(`✅ Election deployed at: ${electionAddress} (for voting)`);
    }

    // Register voters (already done in main function)
    console.log(`✅ Voters registered: ${voterAddresses.length}`);

    // Execute batched voting
    const batchResults = await this.executeBatchedVoting(electionAddress, voterAddresses);
    console.log(`✅ Completed ${batchResults.transactionMetrics.length} voting transactions`);

    // Calculate comprehensive metrics
    const results = await this.calculateBatchedMetrics(batchResults, totalVoters, this.accounts.length);

    return results;
  }

  public async deployElectionForBatch(): Promise<string> {
    const admin = this.accounts[0];
    const ElectionFactory = await ethers.getContractFactory("Election", admin);

    const candidates = ["Alice Johnson", "Bob Smith", "Charlie Brown"];
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime - 60; // Start 1 minute ago (already active)
    const endTime = currentTime + 86400; // End in 24 hours (plenty of time)

    console.log(`   Election: Start=${new Date(startTime * 1000).toISOString()}, End=${new Date(endTime * 1000).toISOString()}`);

    const election = await ElectionFactory.deploy(candidates, startTime, endTime);
    await election.waitForDeployment();

    return await election.getAddress();
  }

  private async executeBatchedVoting(electionAddress: string, voterAddresses: string[]): Promise<{transactionMetrics: VoteMetrics[]}> {
    const metrics: VoteMetrics[] = [];
    const election = await ethers.getContractAt("Election", electionAddress);
    const relayerCount = this.accounts.length;

    console.log(`📊 Processing ${voterAddresses.length} votes using ${relayerCount} relayers...`);

    // Process votes in parallel using multiple relayers
    const votesPerRelayer = Math.ceil(voterAddresses.length / relayerCount);
    const relayerPromises: Promise<VoteMetrics[]>[] = [];

    for (let r = 0; r < relayerCount; r++) {
      const startIdx = r * votesPerRelayer;
      const endIdx = Math.min((r + 1) * votesPerRelayer, voterAddresses.length);
      const relayerVoters = voterAddresses.slice(startIdx, endIdx);

      if (relayerVoters.length > 0) {
        relayerPromises.push(this.processVotesWithRelayer(election, this.accounts[r], relayerVoters, startIdx));
      }
    }

    // Wait for all relayers to complete
    const allMetrics = await Promise.all(relayerPromises);
    metrics.push(...allMetrics.flat());

    return { transactionMetrics: metrics };
  }

  private async processVotesWithRelayer(
    election: any,
    relayer: ethers.Wallet,
    voterAddresses: string[],
    startIndex: number
  ): Promise<VoteMetrics[]> {
    const metrics: VoteMetrics[] = [];
    const electionWithRelayer = election.connect(relayer);

    // Process votes in batches of 10 per transaction for better efficiency
    const batchSize = 10;

    for (let i = 0; i < voterAddresses.length; i += batchSize) {
      const batch = voterAddresses.slice(i, i + batchSize);
      const batchStartIndex = startIndex + i;

      console.log(`   Relayer ${relayer.address.slice(0, 6)}: Processing batch ${Math.floor(i/batchSize) + 1} (${batch.length} votes)...`);

      try {
        // Submit votes for this batch
        const votePromises = batch.map(async (voterAddress, idx) => {
          const candidateId = Math.floor(Math.random() * 3); // Random candidate
          const voterIndex = batchStartIndex + idx;

          const tx = await electionWithRelayer.relayerVoteFor(voterAddress, candidateId);
          const receipt = await tx.wait();

          if (!receipt) return null;

          const block = await this.provider.getBlock(receipt.blockNumber);

          return {
            voterIndex,
            voterAddress,
            gasUsed: receipt.gasUsed,
            gasPrice: receipt.gasPrice || 0n,
            totalCostWei: (receipt.gasUsed * (receipt.gasPrice || 0n)) as unknown as bigint,
            blockNumber: receipt.blockNumber,
            timestampMs: Date.now(), // Use ms precision current time
            transactionIndex: typeof (receipt as any).transactionIndex === 'number' ? (receipt as any).transactionIndex : undefined,
            transactionHash: receipt.hash
          } as VoteMetrics;
        });

        // Wait for all votes in this batch to complete
        const batchResults = await Promise.all(votePromises);
        const validResults = batchResults.filter(result => result !== null) as VoteMetrics[];
        metrics.push(...validResults);

        console.log(`   ✓ Completed ${validResults.length}/${batch.length} votes in batch`);

        // Small delay between batches to avoid overwhelming the network
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error: any) {
        console.log(`   ❌ Batch failed: ${error.message}`);
        // Continue with next batch
      }
    }

    return metrics;
  }

  private async calculateBatchedMetrics(
    batchResults: {transactionMetrics: VoteMetrics[]},
    totalVoters: number,
    relayerCount: number
  ): Promise<BatchedVotingResults> {
    const { transactionMetrics } = batchResults;

    if (transactionMetrics.length === 0) {
      // Return minimal results instead of throwing error
      console.log("⚠️ No successful transactions, returning minimal metrics");
      return this.getMinimalBatchedResults(totalVoters, relayerCount);
    }

    // Calculate gas metrics
    const totalGasUsed = transactionMetrics.reduce((sum, m) => sum + m.gasUsed, 0n);
    const averageGasPerVote = totalGasUsed / BigInt(transactionMetrics.length);
    const totalCostWei = transactionMetrics.reduce((sum, m) => sum + m.totalCostWei, 0n);

    // Group by transaction to calculate transaction metrics
    const txGroups = new Map<string, VoteMetrics[]>();
    transactionMetrics.forEach(metric => {
      if (!txGroups.has(metric.transactionHash)) {
        txGroups.set(metric.transactionHash, []);
      }
      txGroups.get(metric.transactionHash)!.push(metric);
    });

    const totalTransactions = txGroups.size;
    const averageGasPerTransaction = totalGasUsed / BigInt(totalTransactions);
    const batchEfficiency = transactionMetrics.length / totalTransactions; // votes per tx

    // Calculate time metrics (timestamps are in milliseconds)
    const sortedByTime = transactionMetrics.sort((a, b) => a.timestampMs - b.timestampMs);
    const startTime = sortedByTime[0].timestampMs;
    const endTime = sortedByTime[sortedByTime.length - 1].timestampMs;
    const durationMs = endTime - startTime;

    // Calculate throughput
    const averageLatencyMs = durationMs > 0 ? durationMs / (transactionMetrics.length - 1) : 0;
    const throughputVps = durationMs > 0 ? transactionMetrics.length / (durationMs / 1000) : Infinity; // votes per second
    const throughputTps = durationMs > 0 ? totalTransactions / (durationMs / 1000) : Infinity; // transactions per second

    // Calculate block range
    const blockNumbers = transactionMetrics.map(m => m.blockNumber);
    const startBlock = Math.min(...blockNumbers);
    const endBlock = Math.max(...blockNumbers);
    const blockCount = endBlock - startBlock + 1;

    // Calculate relayer utilization
    const activeRelayers = new Set(transactionMetrics.map(m => m.transactionHash.slice(-6))).size;
    const relayerUtilization = (activeRelayers / relayerCount) * 100;

    return {
      totalVoters,
      totalVotes: transactionMetrics.length,
      totalTransactions,
      averageGasPerVote,
      averageGasPerTransaction,
      totalGasUsed,
      totalCostWei,
      averageLatencyMs,
      throughputVps,
      throughputTps,
      batchEfficiency,
      relayerUtilization,
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
      transactionMetrics
    };
  }

  private getMinimalBatchedResults(totalVoters: number, relayerCount: number): BatchedVotingResults {
    const currentTime = Date.now();
    return {
      totalVoters,
      totalVotes: 0,
      totalTransactions: 0,
      averageGasPerVote: 0n,
      averageGasPerTransaction: 0n,
      totalGasUsed: 0n,
      totalCostWei: 0n,
      averageLatencyMs: 0,
      throughputVps: 0,
      throughputTps: 0,
      batchEfficiency: 0,
      relayerUtilization: 0,
      blockRange: { startBlock: 0, endBlock: 0, blockCount: 0 },
      timeRange: { startTime: currentTime, endTime: currentTime, durationMs: 0 },
      transactionMetrics: []
    };
  }

  static exportResultsToCSV(results: BatchedVotingResults, scenario: any): void {
    const reportDir = path.join(__dirname, '..', 'report');

    // Ensure report directory exists
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `performance-test-${scenario.voters}voters-${timestamp}.csv`;

    // Prepare CSV data
    const csvData = [];

    // Add summary header
    csvData.push(['Test Scenario', scenario.description]);
    csvData.push(['Total Voters', results.totalVoters.toString()]);
    csvData.push(['Total Votes', results.totalVotes.toString()]);
    csvData.push(['Total Transactions', results.totalTransactions.toString()]);
    csvData.push(['Success Rate', `${((results.totalVotes / results.totalVoters) * 100).toFixed(2)}%`]);
    csvData.push(['Average Gas per Vote', results.averageGasPerVote.toString()]);
    csvData.push(['Average Gas per Transaction', results.averageGasPerTransaction.toString()]);
    csvData.push(['Total Gas Used', results.totalGasUsed.toString()]);
    const ethCostNumber = Number(ethers.formatEther(results.totalCostWei));
    csvData.push(['Total Cost (ETH)', ethCostNumber.toFixed(8)]);
    // USD conversion (use env ETH_USD_PRICE or default 2000)
    const ethUsdPrice = Number(process.env.ETH_USD_PRICE || '2000');
    const totalCostUsd = ethCostNumber * ethUsdPrice;
    csvData.push(['Total Cost (USD)', totalCostUsd.toFixed(2)]);
    csvData.push(['Average Latency (ms)', results.averageLatencyMs.toFixed(2)]);
    csvData.push(['Vote Throughput (votes/sec)', isFinite(results.throughputVps) ? results.throughputVps.toFixed(2) : 'N/A']);
    csvData.push(['Transaction Throughput (tx/sec)', isFinite(results.throughputTps) ? results.throughputTps.toFixed(2) : 'N/A']);
    csvData.push(['Votes per Transaction', results.batchEfficiency.toFixed(2)]);
    csvData.push(['Relayer Utilization (%)', results.relayerUtilization.toFixed(2)]);
    csvData.push(['Block Range Start', results.blockRange.startBlock.toString()]);
    csvData.push(['Block Range End', results.blockRange.endBlock.toString()]);
    csvData.push(['Blocks Used', results.blockRange.blockCount.toString()]);
    csvData.push(['Duration (seconds)', (results.timeRange.durationMs / 1000).toFixed(2)]);
    csvData.push(['']);
    csvData.push(['Individual Transaction Metrics']);
    // CSV headers (accurate naming)
    csvData.push([
      "Voter Index",
      "Voter Address",
      "Gas Used",
      "Effective Gas Price (wei)",
      "Effective Gas Price (gwei)",
      "Transaction Fee (wei) = gasUsed * effectiveGasPrice",
      "Transaction Fee (gwei)",
      "Transaction Fee (ETH)",
      "Block Number",
      "Timestamp"
    ]);

    results.transactionMetrics.forEach((m) => {
      const gasUsed = BigInt(m.gasUsed);
      const effectiveGasPrice = BigInt(m.gasPrice);
      const txFeeWei = gasUsed * effectiveGasPrice;

      csvData.push([
        String(m.voterIndex),
        m.voterAddress,
        gasUsed.toString(),
        effectiveGasPrice.toString(),
        ethers.formatUnits(effectiveGasPrice, "gwei"),
        txFeeWei.toString(),
        ethers.formatUnits(txFeeWei, "gwei"),
        ethers.formatEther(txFeeWei),
        String(m.blockNumber),
        new Date(m.timestampMs).toISOString()
      ]);
    });


    // Convert to CSV string
    const csvContent = csvData.map(row =>
      row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    // Write to file
    const filePath = path.join(reportDir, filename);
    fs.writeFileSync(filePath, csvContent, 'utf8');

    console.log(`📊 Performance results exported to: ${filePath}`);
  }

  static formatBatchedResults(results: BatchedVotingResults, scenario: any): string {
    const ethCost = Number(ethers.formatEther(results.totalCostWei));

    return `
🏭 BATCHED VOTING PERFORMANCE - ${scenario.description}
${"=".repeat(80)}

📊 GAS METRICS:
   • Average gas per vote: ${results.averageGasPerVote.toLocaleString()}
   • Average gas per transaction: ${results.averageGasPerTransaction.toLocaleString()}
   • Total gas used: ${results.totalGasUsed.toLocaleString()}
   • Total cost: ${ethCost.toFixed(6)} ETH

📦 BATCHING EFFICIENCY:
   • Total votes: ${results.totalVotes.toLocaleString()}
   • Total transactions: ${results.totalTransactions}
   • Votes per transaction: ${results.batchEfficiency.toFixed(2)}
   • Relayer utilization: ${results.relayerUtilization.toFixed(1)}%

⏱️  LATENCY & THROUGHPUT:
   • Average latency: ${results.averageLatencyMs.toFixed(2)} ms
   • Vote throughput: ${results.throughputVps.toFixed(2)} votes/second
   • Transaction throughput: ${results.throughputTps.toFixed(2)} tx/second
   • Duration: ${(results.timeRange.durationMs / 1000).toFixed(2)} seconds

📦 BLOCKCHAIN METRICS:
   • Block range: ${results.blockRange.startBlock} → ${results.blockRange.endBlock}
   • Blocks used: ${results.blockRange.blockCount}
   • Success rate: ${((results.totalVotes / results.totalVoters) * 100).toFixed(1)}%

💡 ANALYSIS:
   • Gas efficiency: ${results.averageGasPerVote < 50000n ? 'EXCELLENT' : results.averageGasPerVote < 100000n ? 'GOOD' : 'NEEDS OPTIMIZATION'}
   • Batching efficiency: ${results.batchEfficiency > 5 ? 'HIGH' : results.batchEfficiency > 2 ? 'MODERATE' : 'LOW'}
   • Network throughput: ${results.throughputVps > 10 ? 'HIGH' : results.throughputVps > 5 ? 'MODERATE' : 'LOW'}
   • Scalability: ${results.totalVotes === results.totalVoters ? 'PERFECT' : 'ISSUES DETECTED'}
`;
  }
}

async function main() {
  // Large-scale voting scenarios: Generate many voter addresses, use few funded accounts
  const testScenarios = [
    { voters: 500, description: "Basic scale test (500 voters)" },
    { voters: 2000, description: "Large scale test (2k voters)" },
    { voters: 5000, description: "Massive scale test (5k voters)" },
    { voters: 10000, description: "Extreme scale test (10k voters)" }
  ];

  // Setup provider
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "http://localhost:8545");

  // Use a consistent Hardhat account that gets reset with the network
  const baseWallet = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);

  console.log("🧪 BLOCKCHAIN VOTING SYSTEM - PERFORMANCE ANALYSIS");
  console.log("Network:", process.env.SEPOLIA_RPC_URL?.includes('sepolia') ? 'Sepolia Testnet' : 'Local Hardhat');
  console.log("Test Scenarios:", testScenarios.map(s => `${s.description}(${s.voters})`).join(', '));

  const allResults: PerformanceResults[] = [];

  for (const scenario of testScenarios) {
    const voterCount = scenario.voters;
    try {
      console.log(`\n🎯 ${scenario.description}: Testing with ${voterCount} voters`);
      console.log(`🔄 Preparing voter addresses and relayer accounts...`);

      // Get Hardhat relayer accounts (only 20 funded accounts needed)
      const allSigners = await ethers.getSigners();
      const relayerAccounts = allSigners.slice(0, 20); // Use all 20 as relayers

      console.log(`✅ Using ${relayerAccounts.length} relayer accounts with 10,000 ETH each`);
      console.log(`🔨 Generating ${voterCount} random voter addresses...`);

      // Generate random voter addresses (no funding needed!)
      const voterAddresses: string[] = [];
      for (let i = 0; i < voterCount; i++) {
        const randomWallet = ethers.Wallet.createRandom();
        voterAddresses.push(randomWallet.address);
      }

      console.log(`📝 Registering ${voterCount} voters with the contract...`);

      // Deploy election contract first to get address for registration
      const tempAnalyzer = new VotingPerformanceAnalyzer(provider, relayerAccounts);
      const electionAddress = await tempAnalyzer.deployElectionForBatch();
      console.log(`📋 Election contract deployed at: ${electionAddress}`);

      // Register all voters in batches
      const adminAccount = relayerAccounts[0];
      const electionContract = await ethers.getContractAt("Election", electionAddress, adminAccount);
      console.log(`👤 Using admin account: ${adminAccount.address}`);

      console.log(`   Election deployed, now registering ${voterAddresses.length} voters...`);

      // Register voters in smaller batches to avoid gas limits
      const batchSize = 50; // Register 50 voters per transaction
      let registeredCount = 0;

      for (let i = 0; i < voterAddresses.length; i += batchSize) {
        const batch = voterAddresses.slice(i, i + batchSize);
        const batchEnd = Math.min(i + batchSize, voterAddresses.length);

        console.log(`   Registering batch ${Math.floor(i/batchSize) + 1}: voters ${i + 1}-${batchEnd} (${batch.length} addresses)...`);

        try {
          console.log(`   Sending registration transaction for ${batch.length} voters...`);
          const tx = await electionContract.batchRegisterVoters(batch);
          console.log(`   Transaction sent: ${tx.hash}, waiting for confirmation...`);

          const receipt = await tx.wait();
          if (!receipt) {
            console.log(`   ❌ Registration transaction returned no receipt`);
            continue;
          }
          console.log(`   Transaction confirmed in block ${receipt.blockNumber}`);

          if (receipt.status === 1) {
            registeredCount += batch.length;
            console.log(`   ✓ Registered ${batch.length} voters (total: ${registeredCount}/${voterAddresses.length})`);
          } else {
            console.log(`   ❌ Registration transaction reverted`);
          }
        } catch (error: any) {
          console.log(`   ❌ Batch registration failed: ${error.message}`);
          console.log(`   Error details:`, error);
        }

        // Small delay between registration batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ Registration complete: ${registeredCount} voters registered`);

      // Verify registration with a sample check
      if (voterAddresses.length > 0) {
        try {
          const isRegistered = await electionContract.isRegisteredVoter(voterAddresses[0]);
          console.log(`   Sample check: First voter registered = ${isRegistered}`);
        } catch (error: any) {
          console.log(`   ⚠️ Could not verify registration: ${error.message}`);
        }
      }

      console.log(`🚀 Starting batched voting test...`);

      // Wait for network to settle
      console.log("⏳ Waiting for network to settle...");
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Create analyzer with relayer accounts and use the same election contract
      const analyzer = new VotingPerformanceAnalyzer(provider, relayerAccounts);
      console.log(`🏭 Starting batched voting test with ${relayerAccounts.length} relayers using contract ${electionAddress}...`);
      const results = await analyzer.runBatchedVotingTest(voterAddresses, voterCount, electionAddress);

      console.log(VotingPerformanceAnalyzer.formatBatchedResults(results, scenario));

      // Export results to CSV
      VotingPerformanceAnalyzer.exportResultsToCSV(results, scenario);

      // Delay between test scenarios to let network settle
      if (voterCount !== testScenarios[testScenarios.length - 1].voters) {
        console.log("⏳ Waiting 10 seconds before next test scenario...");
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

    } catch (error: any) {
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
