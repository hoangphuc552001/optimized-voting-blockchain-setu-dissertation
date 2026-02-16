## Tech Stack for Local zk‑Rollup Experiment (L2 batching + zk proof to L1)

This document lists recommended libraries, frameworks and tooling for building a local zk‑rollup experiment where an L2 sequencer creates batches, generates zk proofs, and submits a validity proof to a local L1 (Hardhat).

--- 

### Core blockchain development
- **hardhat** — Local L1 node, deployment scripts, tests and console.
- **ethers** / **@nomiclabs/hardhat-ethers** — Wallet/provider/contract interactions (frontend, sequencer, deploy scripts).
- **typechain** (optional) — Type-safe contract bindings for TS projects.

### Circuit & zk proof toolchain
- **circom** — Circuit language/compiler for arithmetic circuits.
- **snarkjs** — Compile circuits, witness generation, prove (Groth16/PLONK), export verifier, produce solidity verifier.
- **plonky2 / arkworks** (optional, advanced) — Alternative proving libraries for recursive or high-performance proofs.
- **circomlib / circomlibjs** — Poseidon hash and helper primitives used inside circuits and in-node.

### Hashing, Merkle trees & primitives (off‑chain)
- **circomlibjs** — Poseidon hash in Node for consistency with circuits.
- **merkletreejs**, **fixed-merkle-tree** — Build Merkle trees and produce inclusion proofs off‑chain.

### WASM witness & proof orchestration
- Use the `wasm` artifact from `circom` and `snarkjs` CLI to generate `witness.wtns` and `proof.json`.
- Scripts in Node to orchestrate witness generation, proof generation and transform into Solidity calldata.

### On‑chain verifier & rollup gateway
- `snarkjs` generated `Verifier.sol` — Groth16/PLONK verifier contract.
- Custom `RollupGateway.sol` — wrapper that accepts proofs and updates on‑chain L1 commitments (roots).

### Sequencer / Relayer & Orchestration
- **Node.js** / **TypeScript** scripts — sequencer that:
  - Collects user intents (signed messages)
  - Computes oldRoot → newRoot off‑chain (Poseidon + Merkle helpers)
  - Generates witness, produces proof, and submits proof calldata to L1 verifier
- **ethers** used by sequencer to submit transactions to local Hardhat.

### L2 stack / integration (Polygon zkEVM context)
- Polygon zkEVM RPC & SDK (use network RPC for testnet). Deploy L2 contracts via Hardhat network config pointing at zkEVM RPC.

### Developer tooling
- **snarkjs** (CLI) — proof lifecycle (setup/prove/verify/export).
- **mocha**, **chai** — contract and integration tests.
- **nodemon**, **pm2** — run sequencer during development.
- **dotenv** — manage RPC URLs and private keys.

### Frontend & Wallet integration
- **ethers** (frontend) — provider + signer interactions.
- **MetaMask** — user wallet for signing transactions and switching networks.

### Optional / Advanced
- **plonky2** — for fast recursive zk proofs (experimental/advanced).
- **Tenderly**, **Blockscout**, or local Blockscout — for exploring local chains (heavy).
- **Flashbots** / MEV tooling — advanced ordering/bundling experimentation.

--- 

### Minimal install suggestions
```bash
# Hardhat + ethers
npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers dotenv

# Circom/snarkjs (snarkjs from npm; circom install via OS/Docker)
npm install --save-dev snarkjs

# JS helpers
npm install circomlibjs merkletreejs
```

### Recommended first steps
1. Use Hardhat for local L1 and deploy the `RollupGateway` (Verifier wrapper).  
2. Prototype sequencer that computes Merkle roots and submits a fake proof (MVP).  
3. Add a small `circom` circuit (Merkle update), use `snarkjs` to generate a real proof, and swap the fake proof with real proof generation.  

If you want, I can scaffold the minimal repo layout (circuit skeleton, Hardhat deploy script, RollupGateway.sol, and a sequencer script). Tell me "scaffold" and I will generate the files.

