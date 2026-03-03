# Secure Voting and Zero-Knowledge Proofs

This repository collects the main implementation and supporting experiments for a dissertation project focused on blockchain voting, zero-knowledge proofs, and related cryptographic building blocks.

The workspace is organized as a set of independent prototypes rather than a single application. The largest production-style module is `zk-voting-system`, while the other folders support circuit learning, protocol comparisons, and data analysis.

## Repository Structure

### `zk-voting-system/`

The main end-to-end voting system.

- Solidity smart contracts for election management, verification, and rollup gateway logic
- Hardhat-based development and deployment workflow
- TypeScript backend services for API and monitoring
- Frontend pages for L1 and L2 voting flows
- Circom circuits, proving assets, benchmarks, and performance analysis

Key folders:

- `contracts/`: `Election.sol`, `Verifier.sol`, `RollupGateway.sol`
- `backend/`: API server and monitoring scripts
- `frontend/`: browser UI pages
- `circuits/` and `keys/`: circuit definitions and ZK proving artifacts
- `sequencer/`: batching and Merkle-flow logic
- `analysis/` and `report/`: benchmarking and generated outputs

Quick start:

```bash
cd zk-voting-system
npm install
npm run node
npm run quick-start
npm run server:dev
```

Useful commands:

```bash
npm test
npm run zk:demo
npm run zk:benchmark
```

### `zk-protocols/`

A standalone zero-knowledge playground used to run Circom and `snarkjs` workflows, alongside small protocol comparison scripts.

- Circom circuit compilation and witness generation
- Groth16 setup, proof generation, and verification
- Additional experiments for Schnorr, ring signatures, Bulletproofs, Fiat-Shamir, and STARK-style examples

Main files:

- `circuit.circom`
- `snark.js`
- `schnorr.js`
- `bulletproof.py`
- `ringsignature.py`
- `stark.py`

Quick start:

```bash
cd zk-protocols
npm install
npm start
```

### `circuit/`

Small learning and demonstration projects for Circom and Solidity integration.

- `basicvote/`: a zero-knowledge voting demo with Hardhat, Circom, scripts, and verifier artifacts
- `multiplier/`: a focused Groth16 tutorial that proves knowledge of factors for a public product

These folders are useful for understanding the proof pipeline in isolation before working with the larger voting system.

### `merkletree/`

An interactive Merkle tree demo for visualizing:

- leaf and parent hash construction
- Merkle root updates
- proof generation
- proof verification

Open `merkletree/index.html` in a browser, or run:

```bash
cd merkletree
npm install
npm run demo
```

### `dataset/`

Research and analysis assets used for performance study.

- `data/`: supporting data files
- `01_gas-usage-distribution.ipynb`: notebook for gas usage analysis

## Recommended Reading Order

If you are new to the project, start here:

1. `merkletree/` for Merkle proof intuition
2. `circuit/multiplier/` for a minimal Circom + Groth16 workflow
3. `zk-protocols/` for broader ZK protocol experimentation
4. `zk-voting-system/` for the full voting application and benchmarks

## Prerequisites

Depending on which module you want to run, you may need:

- Node.js and npm
- Hardhat
- Circom
- `snarkjs`
- Python (for some protocol comparison scripts)

See each subproject's own README for module-specific setup details and commands.
