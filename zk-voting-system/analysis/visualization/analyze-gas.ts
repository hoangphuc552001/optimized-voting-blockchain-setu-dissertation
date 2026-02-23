/**
 * Gas Usage Analysis Script
 * Analyzes CSV performance test results to show cold vs warm storage patterns
 */

import * as fs from 'fs';
import * as path from 'path';

// Read the CSV file
const csvPath = path.join(__dirname, '..', 'report', 'performance-test-500voters-2026-02-03T12-06-19-226Z.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.split('\n');

// Candidate names
const candidateNames = [
  "Alice Johnson", "Bob Smith", "Charlie Brown", "Diana Prince",
  "Edward Norton", "Fiona Apple", "George Washington", "Helen Troy",
  "Ivan Petrov", "Julia Roberts", "Kevin Hart", "Lisa Simpson",
  "Michael Jordan", "Nancy Drew", "Oscar Wilde", "Pamela Anderson",
  "Quinn Hughes", "Rachel Green", "Steve Rogers", "Tina Turner"
];

// Parse transaction data (starts at line 22 for headers, data starts at line 23)
const headers = lines[21].split(',').map(h => h.replace(/"/g, ''));
const dataLines = lines.slice(22);

// Find column indices
const getIdx = (name: string) => headers.findIndex(h => h.includes(name));
const gasUsedIdx = getIdx('Gas Used');
const candidateIdIdx = getIdx('Candidate ID');
const candidateNameIdx = getIdx('Candidate Name');
const blockNumIdx = getIdx('Block Number');

interface VoteData {
  candidateId: number;
  candidateName: string;
  gasUsed: number;
  blockNumber: number;
}

const votes: VoteData[] = dataLines
  .filter(line => line.trim())
  .map(line => {
    const cols = line.split(',').map(c => c.replace(/"/g, ''));
    return {
      candidateId: parseInt(cols[candidateIdIdx]),
      candidateName: cols[candidateNameIdx],
      gasUsed: parseInt(cols[gasUsedIdx]),
      blockNumber: parseInt(cols[blockNumIdx])
    };
  });

// Analysis
console.log('='.repeat(80));
console.log('📊 GAS USAGE DISTRIBUTION ANALYSIS');
console.log('='.repeat(80));
console.log(`Total votes analyzed: ${votes.length}\n`);

// Gas tier distribution
const coldGas = votes.filter(v => v.gasUsed >= 77000);
const warmGas = votes.filter(v => v.gasUsed < 77000);

console.log('📈 GAS TIER DISTRIBUTION:');
console.log(`  🔴 Cold Storage (${coldGas.length} votes, ${(coldGas.length/votes.length*100).toFixed(1)}%): ~${coldGas[0]?.gasUsed.toLocaleString()} gas`);
console.log(`  🟢 Warm Storage (${warmGas.length} votes, ${(warmGas.length/warmGas.length*100).toFixed(1)}%): ~${warmGas[0]?.gasUsed.toLocaleString()} gas`);
console.log(`  📊 Difference: ${(coldGas[0]?.gasUsed - warmGas[0]?.gasUsed).toLocaleString()} gas (~${((coldGas[0]?.gasUsed - warmGas[0]?.gasUsed)/warmGas[0]?.gasUsed*100).toFixed(1)}% more)\n`);

// Per-candidate analysis
console.log('📋 GAS USAGE PER CANDIDATE:');
console.log('-'.repeat(70));

interface CandidateStats {
  id: number;
  name: string;
  totalVotes: number;
  coldGasVotes: number;
  warmGasVotes: number;
  avgGas: number;
}

const candidateStats: Record<number, CandidateStats> = {};

votes.forEach(v => {
  if (!candidateStats[v.candidateId]) {
    candidateStats[v.candidateId] = {
      id: v.candidateId,
      name: v.candidateName,
      totalVotes: 0,
      coldGasVotes: 0,
      warmGasVotes: 0,
      avgGas: 0
    };
  }
  candidateStats[v.candidateId].totalVotes++;
  if (v.gasUsed >= 77000) {
    candidateStats[v.candidateId].coldGasVotes++;
  } else {
    candidateStats[v.candidateId].warmGasVotes++;
  }
});

// Calculate averages
Object.values(candidateStats).forEach(stat => {
  const candidateVotes = votes.filter(v => v.candidateId === stat.id);
  stat.avgGas = Math.round(candidateVotes.reduce((sum, v) => sum + v.gasUsed, 0) / candidateVotes.length);
});

// Sort by total votes
const sortedStats = Object.values(candidateStats).sort((a, b) => b.totalVotes - a.totalVotes);

sortedStats.forEach(stat => {
  const coldPercent = (stat.coldGasVotes / stat.totalVotes * 100).toFixed(1);
  const warmPercent = (stat.warmGasVotes / stat.totalVotes * 100).toFixed(1);
  const statusIcon = stat.coldGasVotes > stat.warmGasVotes ? '🔴' : stat.warmGasVotes > stat.coldGasVotes ? '🟢' : '⚪';
  
  console.log(`${statusIcon} ${stat.id.toString().padStart(2)}. ${stat.name.padEnd(18)} | Votes: ${stat.totalVotes.toString().padStart(3)} | Cold: ${stat.coldGasVotes.toString().padStart(2)} (${coldPercent}%) | Warm: ${stat.warmGasVotes.toString().padStart(2)} (${warmPercent}%) | Avg: ${stat.avgGas.toLocaleString()} gas`);
});

console.log('-'.repeat(70));

// First block analysis (initial cold access)
console.log('\n🔍 FIRST BLOCK ANALYSIS (Demonstrating Cold Storage):');
console.log('-'.repeat(70));
const sortedByBlock = [...votes].sort((a, b) => a.blockNumber - b.blockNumber);
const firstFewBlocks = sortedByBlock.filter(v => v.blockNumber <= 20);

firstFewBlocks.forEach(v => {
  const icon = v.gasUsed >= 77000 ? '🔴 COLD' : '🟢 WARM';
  console.log(`  Block ${v.blockNumber.toString().padStart(3)} | ${icon.padEnd(8)} | ${v.candidateName.padEnd(18)} | ${v.gasUsed.toLocaleString()} gas`);
});

// Summary
console.log('\n' + '='.repeat(80));
console.log('📝 KEY FINDINGS:');
console.log('='.repeat(80));
console.log(`
1. GAS BIMODAL DISTRIBUTION:
   - Votes with ~77,411 gas = COLD storage access (first time accessing candidate's voteCount)
   - Votes with ~60,311 gas = WARM storage access (candidate already "warmed up")

2. WHY THE DIFFERENCE?
   - Cold storage access: ~17,100 extra gas (~28% more expensive)
   - This is because Ethereum caches recently accessed storage slots
   - Once a candidate's voteCount is accessed, subsequent votes to that candidate are cheaper

3. CANDIDATE IMPACT:
   - Earlier-voted candidates show more cold accesses
   - Later-voted candidates may benefit from warmed storage

4. OPTIMIZATION OPPORTUNITY:
   - Batch voting by candidate to minimize cold accesses
   - Or accept the variance as normal blockchain behavior
`);
