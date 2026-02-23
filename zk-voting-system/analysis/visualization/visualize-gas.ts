/**
 * Gas Usage Visualization Script for Dissertation Research
 * Generates charts showing gas distribution patterns in blockchain voting
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

// Parse transaction data
const headers = lines[21].split(',').map(h => h.replace(/"/g, ''));
const dataLines = lines.slice(22);

const getIdx = (name: string) => headers.findIndex(h => h.includes(name));
const gasUsedIdx = getIdx('Gas Used');
const candidateIdIdx = getIdx('Candidate ID');
const candidateNameIdx = getIdx('Candidate Name');
const blockNumIdx = getIdx('Block Number');
const voterIdx = getIdx('Voter Index');

interface VoteData {
  voterIndex: number;
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
      voterIndex: parseInt(cols[voterIdx]),
      candidateId: parseInt(cols[candidateIdIdx]),
      candidateName: cols[candidateNameIdx],
      gasUsed: parseInt(cols[gasUsedIdx]),
      blockNumber: parseInt(cols[blockNumIdx])
    };
  });

// Calculate statistics
const coldVotes = votes.filter(v => v.gasUsed >= 77000);
const warmVotes = votes.filter(v => v.gasUsed < 77000);

const gasByCandidate: Record<number, { name: string; votes: number[]; coldCount: number; warmCount: number }> = {};
votes.forEach(v => {
  if (!gasByCandidate[v.candidateId]) {
    gasByCandidate[v.candidateId] = { name: v.candidateName, votes: [], coldCount: 0, warmCount: 0 };
  }
  gasByCandidate[v.candidateId].votes.push(v.gasUsed);
  if (v.gasUsed >= 77000) gasByCandidate[v.candidateId].coldCount++;
  else gasByCandidate[v.candidateId].warmCount++;
});

// Generate HTML visualization
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gas Usage Distribution Analysis - Dissertation Research</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 30px;
        }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .card h3 {
            font-size: 0.9em;
            color: #888;
            margin-bottom: 10px;
        }
        .card .value {
            font-size: 2em;
            font-weight: bold;
        }
        .card.cold .value { color: #ff6b6b; }
        .card.warm .value { color: #51cf66; }
        .card.diff .value { color: #ffd43b; }
        .frequency-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            overflow: hidden;
        }
        .frequency-table th,
        .frequency-table td {
            padding: 15px 20px;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .frequency-table th {
            background: rgba(0,217,255,0.2);
            color: #00d9ff;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 0.9em;
        }
        .frequency-table tr:last-child td {
            border-bottom: none;
        }
        .frequency-table tr:hover {
            background: rgba(255,255,255,0.05);
        }
        .frequency-table .cold-row {
            color: #ff6b6b;
        }
        .frequency-table .warm-row {
            color: #51cf66;
        }
        .frequency-table .diff-row {
            color: #ffd43b;
            font-weight: bold;
        }
        .chart-container {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .chart-title {
            font-size: 1.5em;
            margin-bottom: 20px;
            color: #00d9ff;
        }
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 30px;
        }
        .insights {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 30px;
            margin-top: 30px;
            backdrop-filter: blur(10px);
        }
        .insights h2 {
            color: #00d9ff;
            margin-bottom: 20px;
        }
        .insights ul {
            list-style: none;
            padding: 0;
        }
        .insights li {
            padding: 10px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .insights li::before {
            content: "→";
            color: #00d9ff;
            margin-right: 10px;
        }
        .two-col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }
        @media (max-width: 768px) {
            .two-col { grid-template-columns: 1fr; }
            .charts-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⛽ Gas Usage Distribution Analysis</h1>
        <p class="subtitle">Blockchain Voting Performance Research - 500 Voters, 20 Candidates</p>
        
        <div class="summary-cards">
            <div class="card">
                <h3>Total Votes</h3>
                <div class="value">${votes.length}</div>
            </div>
            <div class="card cold">
                <h3>Cold Storage Access</h3>
                <div class="value">${coldVotes.length} (${(coldVotes.length/votes.length*100).toFixed(1)}%)</div>
            </div>
            <div class="card warm">
                <h3>Warm Storage Access</h3>
                <div class="value">${warmVotes.length} (${(warmVotes.length/votes.length*100).toFixed(1)}%)</div>
            </div>
            <div class="card diff">
                <h3>Gas Difference</h3>
                <div class="value">+${((coldVotes[0]?.gasUsed || 0) - (warmVotes[0]?.gasUsed || 0)).toLocaleString()}</div>
            </div>
        </div>

        <!-- Detailed Frequency Table -->
        <div class="chart-container">
            <h3 class="chart-title">📊 Gas Usage Frequency Distribution Table</h3>
            <table class="frequency-table">
                <thead>
                    <tr>
                        <th>Gas Level</th>
                        <th>Gas Values</th>
                        <th>Frequency</th>
                        <th>Percentage</th>
                        <th>Storage Type</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="warm-row">
                        <td><strong>Lower Gas</strong></td>
                        <td>~60,299 - 60,311</td>
                        <td>${warmVotes.length}</td>
                        <td>${(warmVotes.length/votes.length*100).toFixed(1)}%</td>
                        <td>🔵 Warm Access</td>
                    </tr>
                    <tr class="cold-row">
                        <td><strong>Higher Gas</strong></td>
                        <td>~77,399 - 77,411</td>
                        <td>${coldVotes.length}</td>
                        <td>${(coldVotes.length/votes.length*100).toFixed(1)}%</td>
                        <td>🔴 Cold Access</td>
                    </tr>
                    <tr class="diff-row">
                        <td><strong>Difference</strong></td>
                        <td>~17,100 gas</td>
                        <td>-</td>
                        <td>~28% more expensive</td>
                        <td>⚠️ Cold penalty</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h3 class="chart-title">📊 Gas Distribution Histogram</h3>
                <canvas id="histogramChart"></canvas>
            </div>
            <div class="chart-container">
                <h3 class="chart-title">🥧 Cold vs Warm Storage Distribution</h3>
                <canvas id="pieChart"></canvas>
            </div>
        </div>

        <div class="chart-container">
            <h3 class="chart-title">📈 Gas Usage by Candidate</h3>
            <canvas id="candidateChart"></canvas>
        </div>

        <div class="two-col">
            <div class="chart-container">
                <h3 class="chart-title">📉 Block-by-Block Gas Usage</h3>
                <canvas id="blockChart"></canvas>
            </div>
            <div class="chart-container">
                <h3 class="chart-title">📊 Votes per Candidate</h3>
                <canvas id="voteDistChart"></canvas>
            </div>
        </div>

        <div class="chart-container">
            <h3 class="chart-title">📊 Gas Distribution Over Time (First 100 Transactions)</h3>
            <canvas id="timeChart"></canvas>
        </div>

        <div class="insights">
            <h2>💡 Key Research Findings</h2>
            <ul>
                <li><strong>Bimodal Gas Distribution:</strong> Two distinct gas tiers observed - Cold Storage (~77,411 gas) and Warm Storage (~60,311 gas)</li>
                <li><strong>Cost Impact:</strong> Cold storage access costs ~28.4% more than warm storage access (+17,100 gas)</li>
                <li><strong>Storage Caching:</strong> Ethereum's EVM maintains a "hot cache" of recently accessed storage slots</li>
                <li><strong>First Access Penalty:</strong> Each candidate experiences exactly ONE cold access on their first vote</li>
                <li><strong>Optimization Pattern:</strong> Subsequent votes to the same candidate benefit from warmed storage slots</li>
                <li><strong>Block Correlation:</strong> Gas spikes occur at block boundaries when new candidates receive their first votes</li>
            </ul>
        </div>
    </div>

    <script>
        // Gas distribution histogram data
        const gasValues = ${JSON.stringify(votes.map(v => v.gasUsed))};
        
        // Create histogram bins
        const gasBins = {};
        gasValues.forEach(gas => {
            const bin = Math.floor(gas / 100) * 100;
            gasBins[bin] = (gasBins[bin] || 0) + 1;
        });

        const histogramLabels = Object.keys(gasBins).sort((a,b) => parseInt(a) - parseInt(b));
        const histogramData = histogramLabels.map(l => gasBins[l]);

        // Candidate data
        const candidateLabels = ${JSON.stringify(candidateNames)};
        const candidateColdCounts = ${JSON.stringify(Object.values(gasByCandidate).map((_, i) => gasByCandidate[i]?.coldCount || 0))};
        const candidateWarmCounts = ${JSON.stringify(Object.values(gasByCandidate).map((_, i) => gasByCandidate[i]?.warmCount || 0))};
        const candidateAvgGas = ${JSON.stringify(Object.values(gasByCandidate).map((_, i) => {
            const votes = gasByCandidate[i]?.votes || [];
            return votes.length ? Math.round(votes.reduce((a,b) => a+b, 0) / votes.length) : 0;
        }))};

        // Block data (first 50 blocks)
        const blockGasData = {};
        ${votes.map(v => `blockGasData[${v.blockNumber}] = blockGasData[${v.blockNumber}] || [];
          blockGasData[${v.blockNumber}].push(${v.gasUsed});`).join(';\n')};
        
        const sortedBlocks = Object.keys(blockGasData).sort((a,b) => parseInt(a) - parseInt(b)).slice(0, 50);
        const blockAvgGas = sortedBlocks.map(b => {
            const gas = blockGasData[b];
            return Math.round(gas.reduce((a,c) => a+c, 0) / gas.length);
        });

        // Vote distribution per candidate
        const voteCounts = ${JSON.stringify(Object.values(gasByCandidate).map((_, i) => gasByCandidate[i]?.votes?.length || 0))};

        // Time series (first 100 transactions sorted by voter index)
        const sortedByVoter = ${JSON.stringify(votes.sort((a,b) => a.voterIndex - b.voterIndex).slice(0, 100).map(v => ({ gas: v.gasUsed, candidate: v.candidateName })))};

        // Chart.js configuration
        Chart.defaults.color = '#888';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';

        // 1. Histogram Chart
        new Chart(document.getElementById('histogramChart'), {
            type: 'bar',
            data: {
                labels: histogramLabels,
                datasets: [{
                    label: 'Number of Votes',
                    data: histogramData,
                    backgroundColor: histogramLabels.map(l => parseInt(l) >= 77000 ? 'rgba(255,107,107,0.8)' : 'rgba(81,207,102,0.8)'),
                    borderColor: histogramLabels.map(l => parseInt(l) >= 77000 ? '#ff6b6b' : '#51cf66'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Gas Usage Distribution (Two Tiers: Cold ~77K, Warm ~60K)' }
                },
                scales: {
                    x: { title: { display: true, text: 'Gas Used' } },
                    y: { title: { display: true, text: 'Frequency' } }
                }
            }
        });

        // 2. Pie Chart
        new Chart(document.getElementById('pieChart'), {
            type: 'doughnut',
            data: {
                labels: ['Cold Storage Access', 'Warm Storage Access'],
                datasets: [{
                    data: [${coldVotes.length}, ${warmVotes.length}],
                    backgroundColor: ['rgba(255,107,107,0.8)', 'rgba(81,207,102,0.8)'],
                    borderColor: ['#ff6b6b', '#51cf66'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

        // 3. Candidate Chart
        new Chart(document.getElementById('candidateChart'), {
            type: 'bar',
            data: {
                labels: candidateLabels,
                datasets: [
                    {
                        label: 'Cold Access',
                        data: candidateColdCounts,
                        backgroundColor: 'rgba(255,107,107,0.8)'
                    },
                    {
                        label: 'Warm Access',
                        data: candidateWarmCounts,
                        backgroundColor: 'rgba(81,207,102,0.8)'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'Cold vs Warm Storage Access by Candidate' },
                    legend: { position: 'top' }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, title: { display: true, text: 'Number of Votes' } }
                }
            }
        });

        // 4. Block Chart
        new Chart(document.getElementById('blockChart'), {
            type: 'line',
            data: {
                labels: sortedBlocks,
                datasets: [{
                    label: 'Average Gas per Block',
                    data: blockAvgGas,
                    borderColor: '#00d9ff',
                    backgroundColor: 'rgba(0,217,255,0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'Gas Usage Pattern Over Blocks (Shows Cold Access Spikes)' }
                },
                scales: {
                    x: { title: { display: true, text: 'Block Number' } },
                    y: { title: { display: true, text: 'Average Gas Used' } }
                }
            }
        });

        // 5. Vote Distribution Chart
        new Chart(document.getElementById('voteDistChart'), {
            type: 'bar',
            data: {
                labels: candidateLabels,
                datasets: [{
                    label: 'Total Votes',
                    data: voteCounts,
                    backgroundColor: candidateLabels.map((_, i) => {
                        const cold = candidateColdCounts[i];
                        const total = voteCounts[i];
                        const ratio = cold / total;
                        return \`rgba(\${255}, \${Math.round(107 * (1-ratio))}, \${Math.round(107 * ratio)}, 0.8)\`;
                    }),
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                indexAxis: 'y',
                plugins: {
                    title: { display: true, text: 'Vote Distribution Across Candidates' },
                    legend: { display: false }
                },
                scales: {
                    x: { title: { display: true, text: 'Number of Votes' } }
                }
            }
        });

        // 6. Time Series Chart
        new Chart(document.getElementById('timeChart'), {
            type: 'line',
            data: {
                labels: sortedByVoter.map((_, i) => \`Tx \${i+1}\`),
                datasets: [{
                    label: 'Gas Used',
                    data: sortedByVoter.map(v => v.gas),
                    borderColor: sortedByVoter.map(v => v.gas >= 77000 ? '#ff6b6b' : '#51cf66'),
                    backgroundColor: sortedByVoter.map(v => v.gas >= 77000 ? 'rgba(255,107,107,0.2)' : 'rgba(81,207,102,0.2)'),
                    fill: true,
                    tension: 0.3,
                    pointRadius: sortedByVoter.map(v => v.gas >= 77000 ? 6 : 2),
                    pointBackgroundColor: sortedByVoter.map(v => v.gas >= 77000 ? '#ff6b6b' : '#51cf66')
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'Gas Usage Over First 100 Transactions (Red = Cold Access)' },
                    legend: { display: false }
                },
                scales: {
                    x: { display: false },
                    y: { title: { display: true, text: 'Gas Used' } }
                }
            }
        });
    </script>
</body>
</html>`;

// Save HTML file
const outputPath = path.join(__dirname, '..', 'report', 'gas-analysis-visualization.html');
fs.writeFileSync(outputPath, htmlContent);
console.log(`✅ Visualization saved to: ${outputPath}`);
console.log('\n📊 Open this file in a browser to view interactive charts!');
