/**
 * Performance Benchmark: L1 vs L2 Voting - 1 Million Votes Simulation
 */

import { ethers } from 'hardhat';

const CANDIDATE_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Edward"];

async function main() {
    console.log('================================================================================');
    console.log('    ZK ROLLUP VOTING SYSTEM - 1,000,000 VOTES SIMULATION');
    console.log('================================================================================\n');
    
    // Configuration
    const actualVoters = 20;
    const simulatedVotes = 1000000;
    const batchSize = 1000; // Larger batch = more savings
    
    console.log(`Configuration:`);
    console.log(`  Simulated votes: ${simulatedVotes.toLocaleString()}`);
    console.log(`  L2 batch size: ${batchSize}\n`);
    
    // Deploy contract to get actual gas metrics
    const [deployer] = await ethers.getSigners();
    const ElectionFactory = await ethers.getContractFactory("Election");
    
    const currentTime = Math.floor(Date.now() / 1000);
    const election = await ElectionFactory.connect(deployer).deploy(
        CANDIDATE_NAMES, 
        currentTime - 60, 
        currentTime + 3600
    );
    await election.waitForDeployment();
    
    // Generate voter addresses
    const voterAddresses = [];
    for (let i = 0; i < actualVoters; i++) {
        voterAddresses.push(ethers.Wallet.createRandom().address);
    }
    
    // Register voters
    await election.batchRegisterVoters(voterAddresses);
    
    // Cast votes to get actual gas
    const tx = await election.relayerVoteFor(voterAddresses[0], 0);
    const receipt = await tx.wait();
    const gasPerVote = Number(receipt.gasUsed) / actualVoters;
    
    console.log(`Based on actual test: ${gasPerVote.toFixed(0)} gas per vote\n`);
    
    // Calculate L1 metrics
    const l1TotalGas = BigInt(Math.floor(gasPerVote * simulatedVotes));
    const l1GasPerVote = gasPerVote;
    
    // Calculate L2 metrics
    const numBatches = Math.ceil(simulatedVotes / batchSize);
    const l1VerificationGas = 200000n; // per batch
    const l2OffChainGas = 300n; // per vote (signature verification only)
    
    const totalL1Gas = l1VerificationGas * BigInt(numBatches);
    const totalL2Gas = l2OffChainGas * BigInt(simulatedVotes);
    const l2TotalGas = totalL1Gas + totalL2Gas;
    const l2GasPerVote = Number(l2TotalGas) / simulatedVotes;
    
    // Gas price and ETH price
    const gasPrice = 50e9; // 50 gwei
    const ethPrice = 2000;
    
    const l1CostUSD = Number(l1TotalGas) * gasPrice * 1e-9 * ethPrice;
    const l2CostUSD = Number(l2TotalGas) * gasPrice * 1e-9 * ethPrice;
    const savings = l1CostUSD - l2CostUSD;
    const savingsPercent = (savings / l1CostUSD) * 100;
    
    // L2 timing
    const proofGenTimePerBatch = 5000; // 5 seconds
    const l1SubmissionTime = 2000; // 2 seconds
    const totalL2TimeMs = numBatches * (proofGenTimePerBatch + l1SubmissionTime);
    
    // Print results
    console.log(`
================================================================================
                     RESULTS: 1,000,000 VOTES
================================================================================

METRIC                      LAYER 1              ZK ROLLUP (L2)       IMPROVEMENT
--------------------------------------------------------------------------------
Votes Processed            ${simulatedVotes.toLocaleString()}           ${simulatedVotes.toLocaleString()}
Gas per Vote              ${l1GasPerVote.toLocaleString()}              ${l2GasPerVote.toLocaleString()}              ${((l1GasPerVote - l2GasPerVote) / l1GasPerVote * 100).toFixed(1)}%
Total Gas                 ${l1TotalGas.toLocaleString()}          ${l2TotalGas.toLocaleString()}          ${((Number(l1TotalGas) - Number(l2TotalGas)) / Number(l1TotalGas) * 100).toFixed(1)}%
Cost (USD)*               $${l1CostUSD.toLocaleString()}         $${l2CostUSD.toLocaleString()}         ${savingsPercent.toFixed(1)}%
Batches                   ${simulatedVotes.toLocaleString()}           ${numBatches.toLocaleString()}             ${((simulatedVotes - numBatches) / simulatedVotes * 100).toFixed(2)}%

* At 50 gwei gas price, $2000/ETH

================================================================================
                        L2 BATCH METRICS
================================================================================

Total Batches:              ${numBatches.toLocaleString()}
Votes per Batch:            ${batchSize.toLocaleString()}
L1 Gas per Batch:           200,000 (ZK proof verification)
Off-chain Gas per Vote:    300 (signature verification)

================================================================================
                        COST BREAKDOWN
================================================================================

LAYER 1 (Direct Voting):
  • ${simulatedVotes.toLocaleString()} votes × ${l1GasPerVote.toFixed(0)} gas = ${l1TotalGas.toLocaleString()} gas
  • Cost: $${l1CostUSD.toLocaleString()}

LAYER 2 (ZK Rollup):
  • ${numBatches.toLocaleString()} batches × 200,000 gas = ${totalL1Gas.toLocaleString()} gas (L1)
  • ${simulatedVotes.toLocaleString()} votes × 300 gas = ${totalL2Gas.toLocaleString()} gas (off-chain)
  • Total: ${l2TotalGas.toLocaleString()} gas
  • Cost: $${l2CostUSD.toLocaleString()}

================================================================================
                           SAVINGS
================================================================================

TOTAL SAVINGS: $${savings.toLocaleString()} (${savingsPercent.toFixed(1)}%)

At 50 gwei / $2000 ETH:
  • L1: ${Number(l1TotalGas) / 1e9} ETH
  • L2: ${Number(l2TotalGas) / 1e9} ETH

================================================================================
                      SCALABILITY COMPARISON
================================================================================

VOTES          L1 GAS         L2 GAS        SAVINGS
-----------------------------------------------------------
1,000          ${(l1GasPerVote * 1000).toLocaleString()}        ${(Number(totalL1Gas) + Number(totalL2Gas) * 1000 / simulatedVotes).toLocaleString()}        ${((1 - (Number(totalL1Gas) + Number(totalL2Gas) * 1000 / simulatedVotes) / (l1GasPerVote * 1000)) * 100).toFixed(0)}%
10,000         ${(l1GasPerVote * 10000).toLocaleString()}        ${(Number(totalL1Gas) + Number(totalL2Gas) * 10000 / simulatedVotes).toLocaleString()}        ${((1 - (Number(totalL1Gas) + Number(totalL2Gas) * 10000 / simulatedVotes) / (l1GasPerVote * 10000)) * 100).toFixed(0)}%
100,000        ${(l1GasPerVote * 100000).toLocaleString()}        ${(Number(totalL1Gas) + Number(totalL2Gas) * 100000 / simulatedVotes).toLocaleString()}        ${((1 - (Number(totalL1Gas) + Number(totalL2Gas) * 100000 / simulatedVotes) / (l1GasPerVote * 100000)) * 100).toFixed(0)}%
1,000,000      ${(l1GasPerVote * 1000000).toLocaleString()}       ${l2TotalGas.toLocaleString()}        ${savingsPercent.toFixed(1)}%
10,000,000     ${(l1GasPerVote * 10000000).toLocaleString()}       ${(Number(totalL1Gas) + Number(totalL2Gas) * 10).toLocaleString()}        ${((1 - (Number(totalL1Gas) + Number(totalL2Gas) * 10) / (l1GasPerVote * 10000000)) * 100).toFixed(1)}%

================================================================================
`);
}

main();
