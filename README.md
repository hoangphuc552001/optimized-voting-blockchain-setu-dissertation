# Project: Secure Voting System with Zero-Knowledge Proofs


## Project Structure

### 🔗 layer1/
**Blockchain Voting Application**
- Solidity smart contracts for election management
- Hardhat development framework
- TypeScript backend API with Express.js
- Automated testing and deployment scripts

**Quick Start:**
```bash
cd layer1/
npm install
npm run quick-start
npm run server:dev
```

### 🔐 zksnark/
**Zero-Knowledge Proof Components**
- Circom circuits for verifiable computation
- SNARK.js proof generation and verification
- Multiple cryptographic protocols (Bulletproofs, Ring Signatures, STARKs)
- Performance comparison and analysis tools

**Quick Start:**
```bash
cd zksnark/
npm install
npm start
```

## Architecture Overview

The system combines:
- **Layer 1**: Ethereum-compatible smart contracts for vote recording
- **ZK Layer**: Privacy-preserving proof systems for vote verification
- **Backend**: REST API for election management and monitoring
- **Frontend**: Simple web interface for voting interactions

## Technologies Used

- **Blockchain**: Solidity, Hardhat, Ethers.js
- **Cryptography**: Circom, SNARK.js, Custom ZK protocols
- **Backend**: Node.js, TypeScript, Express
- **Testing**: Chai, Mocha, Hardhat test framework

## Getting Started

1. Clone the repository
2. Set up environment variables (see individual READMEs)
3. Install dependencies in each component directory
4. Run the quick-start scripts for demonstration

See individual component READMEs for detailed setup instructions.