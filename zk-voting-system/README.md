# ZK Voting System

Blockchain voting project with ZK Rollup (L2) support using Solidity, Hardhat, and Circom.

## Main Parts

- `contracts/`: Election, Verifier, RollupGateway
- `backend/`: API server + monitor
- `sequencer/`: L2 batching and Merkle flow
- `circuits/` + `keys/`: ZK circuit and proof assets
- `analysis/`: L1 metrics and L1 vs L2 benchmarks (including `analysis/comparison/*`)
- `frontend/`: voting UI
- `report/`: generated benchmark outputs

## Quick Start

```bash
npm install
npm run node
npm run quick-start
npm run server:dev
```

## Useful Commands

```bash
npm test
npm run deploy:local
npm run zk:demo
npm run zk:benchmark
npx ts-node scripts/run-benchmark.ts
npx ts-node analysis/comparison/l1-vs-l2-benchmark.ts
```
