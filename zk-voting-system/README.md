# ZK Voting System

Blockchain-based voting system with ZK Rollup Layer 2 scalability. Built with Solidity, Hardhat, and Circom.

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24 (Election, Verifier, RollupGateway)
- **Framework**: Hardhat + TypeScript
- **ZK Proofs**: Circom circuits + SNARK.js
- **Backend**: Express.js REST API
- **L2**: Custom sequencer with Merkle tree batching
- **Networks**: Hardhat local, Sepolia testnet

## Project Structure

```
contracts/       → Solidity smart contracts (Election, Verifier, RollupGateway)
circuits/        → Circom ZK circuits
keys/            → ZK proving/verification keys and PTAU files
backend/         → Express API server and monitor
sequencer/       → L2 sequencer with Merkle tree
scripts/         → Deployment and management scripts
test/            → Contract tests
analysis/        → Performance benchmarks and visualizations
frontend/        → Web UI for voting
report/          → Benchmark results and gas analysis
docs/            → Technical documentation
```

## Setup

```bash
npm install
cp .env.example .env   # Configure your keys
```

## Quick Start (Local)

```bash
# Terminal 1 - Start local node
npm run node

# Terminal 2 - Deploy & run
npm run quick-start
npm run server:dev
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile contracts |
| `npm test` | Run tests |
| `npm run deploy:local` | Deploy to local network |
| `npm run deploy:sepolia` | Deploy to Sepolia |
| `npm run server:dev` | Start backend (dev mode) |
| `npm run zk:compile` | Compile Circom circuits |
| `npm run zk:demo` | Run ZK proof demo |
| `npm run zk:deploy:local` | Deploy ZK verifier locally |
| `npm run performance` | Run L1 performance tests |
| `npm run zk:benchmark` | Run L2 benchmark |
| `npm run l2:frontend` | Serve frontend on port 8080 |

## Environment Variables

Create a `.env` file with:

```
SEPOLIA_RPC_URL=<your_rpc_url>
PRIVATE_KEY=<your_private_key>
ETHERSCAN_API_KEY=<your_api_key>
```

