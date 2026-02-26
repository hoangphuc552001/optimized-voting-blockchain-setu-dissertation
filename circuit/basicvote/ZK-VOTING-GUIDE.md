# Zero-Knowledge Voting Demo Guide

## Complete End-to-End ZK Voting with Circom 2.0, snarkjs Groth16, and Solidity

---

## Table of Contents

1. [Overview](#overview)
2. [System Requirements & Limitations](#system-requirements--limitations)
3. [File Structure](#file-structure)
4. [Circuit Code](#circuit-code)
5. [Prerequisites](#prerequisites)
6. [Compilation Commands](#compilation-commands)
7. [Trusted Setup Commands](#trusted-setup-commands)
8. [Proof Generation](#proof-generation)
9. [Local Verification](#local-verification)
10. [Solidity Verifier Contract](#solidity-verifier-contract)
11. [BallotBox.sol Contract](#ballotboxsol-contract)
12. [On-Chain vs Off-Chain Explained](#on-chain-vs-off-chain-explained)
13. [Transparency & Privacy](#transparency--privacy)
14. [Third-Party Verification](#third-party-verification)
15. [Hardhat Deployment](#hardhat-deployment)
16. [Common Pitfalls](#common-pitfalls)

---

## Overview

This guide demonstrates a minimal **zero-knowledge voting demo** using:

- **Circom 2.0**: Circuit compiler for writing ZK circuits
- **snarkjs**: Library for Groth16 proof generation and verification
- **Solidity**: Smart contract for on-chain verification

The demo proves that a voter has:
1. A valid vote (boolean: 0 or 1)
2. A valid candidate (one of 0..4 for 5 candidates)
3. A unique ballot hash

Without revealing:
- Which candidate they voted for
- Whether they voted for or against
- The salt used in hashing

---

## System Requirements & Limitations

### What This Circuit Enforces

✅ **vote is boolean** - Must be 0 or 1  
✅ **candidate is valid** - Must be in range 0 to numCandidates-1  
✅ **ballotHash is correct** - Must equal Poseidon(candidate, vote, salt)  

### IMPORTANT LIMITATIONS

⚠️ **NO eligibility check**: Anyone can submit a vote (no proof of identity or right to vote)  
⚠️ **NO anti-double-vote**: Same person can vote multiple times with different salts  
⚠️ **NO tally**: The contract cannot count votes from ballots (would need different circuit)  

> **This is a DEMONSTRATION circuit only!** A real voting system needs additional components.

---

## File Structure

```
zk-voting-demo/
├── BasicVote.circom          # Circuit definition
├── input.json                # Example input
├── build/                    # Generated artifacts
│   ├── BasicVote.r1cs       # Compiled circuit
│   ├── BasicVote.sym        # Symbol file
│   ├── BasicVote_js/        # WASM witness generator
│   │   ├── BasicVote.wasm
│   │   └── generate_witness.js
│   ├── tau.ptau             # Powers of Tau (Phase 1)
│   ├── tau_final.ptau       # After Phase 1 contribution
│   ├── BasicVote_0000.zkey  # Initial zkey (Phase 2)
│   ├── BasicVote_0001.zkey  # After contribution
│   ├── verification_key.json # Verification key
│   ├── witness.json         # Calculated witness
│   ├── witness.wtns        # Binary witness
│   ├── proof.json          # Generated proof
│   └── public.json         # Public inputs
├── contracts/
│   ├── Verifier.sol        # Auto-generated verifier
│   └── BallotBox.sol       # Voting contract
├── scripts/
│   └── deploy.js           # Hardhat deployment script
├── hardhat.config.js       # Hardhat configuration
└── package.json            # Dependencies
```

---

## Circuit Code

### BasicVote.circom

```circom
pragma circom 2.0.0;

include "circomlib/poseidon.circom";

/*
 * BasicVote.circom - A minimal ZK voting circuit
 * 
 * Circuit Requirements:
 * - vote is boolean (0 or 1)
 * - candidate is one of 0..(numCandidates-1)
 * - outputs public ballotHash = Poseidon(candidate, vote, salt)
 */

template BasicVote(numCandidates) {
    // Private inputs (known only to the voter)
    signal input candidate;
    signal input vote;       // 0 = against, 1 = for
    signal input salt;       // Random salt for hash uniqueness

    // Public output (visible to everyone)
    signal output ballotHash;

    // CONSTRAINT 1: vote is boolean (0 or 1)
    // vote * vote === vote ensures vote can only be 0 or 1
    vote * vote === vote;

    // CONSTRAINT 2: candidate is in valid range [0, numCandidates-1]
    component lessThan = LessThan(256);
    lessThan.in[0] <== candidate;
    lessThan.in[1] <== numCandidates;
    lessThan.out === 1;

    // CONSTRAINT 3: Generate ballot hash
    // Use Poseidon hash: H(candidate, vote, salt)
    component poseidon = Poseidon(3);
    poseidon.inputs[0] <== candidate;
    poseidon.inputs[1] <== vote;
    poseidon.inputs[2] <== salt;
    
    ballotHash <== poseidon.out;
}

// Main component with 5 candidates (0, 1, 2, 3, 4)
// Only ballotHash is public - candidate, vote, and salt remain private
component main {public [ballotHash]} = BasicVote(5);
```

---

## Prerequisites

### 1. Install Node.js

Download from https://nodejs.org/ (LTS version recommended)

### 2. Install circom

```bash
npm install -g circom
```

### 3. Install snarkjs

```bash
npm install -g snarkjs
```

### 4. Initialize project and install dependencies

```bash
mkdir zk-voting-demo
cd zk-voting-demo
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

### 5. Install circomlib (for Poseidon)

```bash
# circomlib is included when you compile with --sym
# For Node.js, we need the npm package
npm install circomlib
```

---

## Compilation Commands

### Step 1: Compile Circuit to R1CS and WASM

```bash
circom BasicVote.circom --r1cs --wasm --sym -o build
```

This generates:
- `build/BasicVote.r1cs` - The circuit in R1CS format
- `build/BasicVote_js/BasicVote.wasm` - WASM binary for witness generation
- `build/BasicVote.sym` - Symbol table for debugging

**Expected output:**
```
Circom Compiler v2.0.0
Compiling BasicVote.circom...
R1CS file: build/BasicVote.r1cs
Sym file: build/BasicVote.sym
WASM file: build/BasicVote_js/BasicVote.wasm
```

---

## Trusted Setup Commands

### Step 2: Powers of Tau Ceremony (Phase 1)

Generate the initial Powers of Tau file. The number `15` means 2^15 = 32768 powers.

```bash
snarkjs powersoftau new bn128 15 build/tau.ptau -v
```

**What this does:**
- Creates `build/tau.ptau` with cryptographic parameters
- Uses BN128 elliptic curve
- Generates 32768 powers of Tau

### Step 3: Contribute to Powers of Tau (Optional but recommended)

```bash
snarkjs powersoftau contribute build/tau.ptau build/tau_final.ptau --name="First contribution" -v -e="random entropy here"
```

Enter a random string when prompted (or use `-e` flag).

### Step 4: Groth16 Setup (Phase 2 - Circuit Specific)

```bash
snarkjs groth16 setup build/BasicVote.r1cs build/tau_final.ptau build/BasicVote_0000.zkey
```

This creates the initial zkey containing both proving and verification keys.

### Step 5: Contribute Randomness (Optional but recommended)

```bash
snarkjs zkey contribute build/BasicVote_0000.zkey build/BasicVote_0001.zkey --name="Contributor 1" -v -e="more random entropy"
```

### Step 6: Export Verification Key

```bash
snarkjs zkey export verificationkey build/BasicVote_0001.zkey build/verification_key.json
```

This creates `build/verification_key.json` which is needed for:
- Local verification with snarkjs
- Generating the Solidity verifier contract

---

## Proof Generation

### Step 7: Create Input File

Create `input.json` with your vote:

```json
{
  "candidate": "2",
  "vote": "1",
  "salt": "1234567890123456789012345678901234567890123456789012345678901234"
}
```

**Example values:**
- `candidate`: "2" (voting for candidate 2)
- `vote`: "1" (voting FOR, not against)
- `salt`: Any random 256-bit number (keep secret!)

> **Note:** The salt must be a 256-bit (32-byte) number represented as a string. Generate a random one for each vote!

### Step 8: Generate Witness

```bash
node build/BasicVote_js/generate_witness.js build/BasicVote_js/BasicVote.wasm input.json build/witness.json
```

This calculates all intermediate signals and produces:
- `build/witness.json` - All signal values
- `build/witness.wtns` - Binary witness file

### Step 9: Generate Proof

```bash
snarkjs groth16 prove build/BasicVote_0001.zkey build/witness.json build/proof.json build/public.json
```

This creates:
- `build/proof.json` - The ZK proof (contains pi_a, pi_b, pi_c)
- `build/public.json` - Public inputs (the ballotHash)

---

## Local Verification

### Step 10: Verify Proof Locally

```bash
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

**Expected output:**
```
[INFO]  snarkJS: OK!
[INFO]  snarkJS: ✅ Proof verified!
```

If the proof is invalid, you'll see:
```
[ERROR] snarkJS: Invalid proof
```

---

## Solidity Verifier Contract

### Step 11: Export Solidity Verifier

```bash
snarkjs zkey export solidityverifier build/BasicVote_0001.zkey contracts/Verifier.sol
```

This generates a `Verifier.sol` contract with a `verifyProof` function that can be called on-chain.

### Step 12: Get Call Data for On-Chain Verification

To submit the proof to the blockchain, you need the calldata:

```bash
snarkjs generarealtime
```

Actually, use this to get the formatted calldata:

```bash
snarkjs zkey export soliditycalldata build/public.json build/proof.json
```

**Example output:**
```
["0x123...abc", "0x456...def", "0x789...ghi", ["0x000...001"]]
```

The output contains:
1. `a` - G1 point (2 elements)
2. `b` - G2 point (2x2 elements)
3. `c` - G1 point (2 elements)
4. `input` - Public inputs array (1 element: ballotHash)

---

## BallotBox.sol Contract

### Complete Voting Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Verifier.sol";

/**
 * @title BallotBox
 * @dev A minimal ZK voting contract
 * 
 * IMPORTANT LIMITATIONS:
 * - NO eligibility check (anyone can submit a ballot)
 * - NO anti-double-vote (same person can vote multiple times with different salts)
 * - NO tally (cannot count votes from ballots)
 * 
 * This is for DEMONSTRATION only!
 */
contract BallotBox {
    // Address of the Verifier contract
    Verifier public verifier;
    
    // Event emitted when a ballot is accepted
    event BallotAccepted(uint256 indexed ballotHash);
    
    // Optional: Store accepted ballot hashes to prevent duplicates
    // NOTE: This does NOT prevent double-voting!
    // A voter can simply use a different salt to create a different hash
    mapping(uint256 => bool) public ballotHashes;
    
    // Counter for total ballots submitted
    uint256 public ballotCount;
    
    constructor(address _verifier) {
        verifier = Verifier(_verifier);
        ballotCount = 0;
    }
    
    /**
     * @dev Submit a ballot with zero-knowledge proof
     * @param a G1 point - proof.pi_a
     * @param b G2 point - proof.pi_b  
     * @param c G1 point - proof.pi_c
     * @param input Public inputs array [ballotHash]
     */
    function submitBallot(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public {
        // Verify the proof
        require(
            verifier.verifyProof(a, b, c, input),
            "Invalid proof"
        );
        
        // Get the ballot hash from public inputs
        uint256 ballotHash = input[0];
        
        // Optional: Check for exact duplicate (does NOT prevent double-voting!)
        // Reason: Voter can use different salt → different hash → can vote again
        require(
            !ballotHashes[ballotHash],
            "Ballot already submitted"
        );
        
        // Mark this hash as used
        ballotHashes[ballotHash] = true;
        ballotCount++;
        
        emit BallotAccepted(ballotHash);
    }
    
    /**
     * @dev Get the verifier address
     */
    function getVerifierAddress() public view returns (address) {
        return address(verifier);
    }
}
```

---

## On-Chain vs Off-Chain Explained

### Off-Chain Components

| Component | Location | Description |
|-----------|----------|-------------|
| Circuit (BasicVote.circom) | Developer machine | Defines the voting rules |
| Trusted Setup | Developer machine | Generates proving/verification keys |
| Witness Generation | Voter's device | Calculates all signals from private inputs |
| Proof Generation | Voter's device | Creates the ZK proof |
| Private Inputs | Voter's device | candidate, vote, salt (never revealed) |

**Off-chain means:** These operations happen on the voter's computer or server, not on the blockchain. They are not visible to the public and cost no gas.

### On-Chain Components

| Component | Location | Description |
|-----------|----------|-------------|
| Verifier.sol | Ethereum/EVM chain | Contains the verification key and verifyProof function |
| BallotBox.sol | Ethereum/EVM chain | Accepts and stores ballot hashes |
| Transaction Data | Blockchain | Contains proof (a, b, c) and public input (ballotHash) |
| Events | Blockchain | BallotAccepted events are publicly visible |

**On-chain means:** These operations happen on the blockchain. They are publicly visible and cost gas.

---

## Transparency & Privacy

### What "Transparency" Means

✅ **Anyone can verify proofs** - The proof and public inputs are stored on-chain  
✅ **Anyone can run snarkjs verify** - Using verification_key.json + proof.json + public.json  
✅ **Anyone can call verifier.verifyProof()** - The function is public  
✅ **All ballot hashes are visible** - Everyone can see every ballot submitted  
✅ **Proof validity is public** - Invalid proofs are rejected by the contract  

### What "Privacy" Means

🔒 **Candidate is hidden** - The circuit never reveals which candidate was chosen  
🔒 **Vote is hidden** - No one knows if it's a "for" or "against" vote  
🔒 **Salt is hidden** - The random value used in hashing is never revealed  
🔒 **Linkability is limited** - Without the salt, no one can determine the vote  

### What CANNOT Be Hidden

❌ **BallotHash is public** - This is necessary for verification  
❌ **Proof existence** - Someone knows a vote was cast  
❌ **Timing** - Transaction timestamp is visible  
❌ **Sender address** - If using a wallet, the address is known  

---

## Third-Party Verification

### Method 1: Using On-Chain Data (Most Direct)

Anyone can verify a submitted vote by:

1. **Get the transaction** that called `submitBallot()`
2. **Extract the calldata**:
   - `a[0]`, `a[1]` - First G1 point
   - `b[0][0]`, `b[0][1]`, `b[1][0]`, `b[1][1]` - G2 point
   - `c[0]`, `c[1]` - Second G1 point
   - `input[0]` - The ballotHash
3. **Call verifyProof()** on the Verifier contract

Example using ethers.js:

```javascript
const verifier = await ethers.getContractAt("Verifier", verifierAddress);

// Extract from transaction data
const a = [txData.a0, txData.a1];
const b = [[txData.b00, txData.b01], [txData.b10, txData.b11]];
const c = [txData.c0, txData.c1];
const input = [txData.ballotHash];

const isValid = await verifier.verifyProof(a, b, c, input);
console.log("Proof valid:", isValid);
```

### Method 2: Using snarkjs with On-Chain Data

To verify off-chain using snarkjs:

1. **Extract from transaction**:
   - Get `a`, `b`, `c` from calldata
   - Get `ballotHash` from input

2. **Reconstruct public.json**:
```json
["0x<ballotHash>"]
```

3. **Reconstruct proof.json**:
```json
{
  "protocol": "groth16",
  "curve": "bn128",
  "pi_a": ["0x<a0>", "0x<a1>"],
  "pi_b": [
    ["0x<b00>", "0x<b01>"],
    ["0x<b10>", "0x<b11>"]
  ],
  "pi_c": ["0x<c0>", "0x<c1>"]
}
```

4. **Verify with snarkjs**:
```bash
snarkjs groth16 verify verification_key.json public.json proof.json
```

---

## Hardhat Deployment

### 1. Install Hardhat

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

### 2. Create hardhat.config.js

```javascript
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts"
  }
};
```

### 3. Create deploy script (scripts/deploy.js)

```javascript
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying contracts...");
  
  // Deploy Verifier first
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Verifier deployed to:", verifierAddress);
  
  // Deploy BallotBox with verifier address
  const BallotBox = await ethers.getContractFactory("BallotBox");
  const ballotBox = await BallotBox.deploy(verifierAddress);
  await ballotBox.waitForDeployment();
  const ballotBoxAddress = await ballotBox.getAddress();
  console.log("BallotBox deployed to:", ballotBoxAddress);
  
  // Save addresses for reference
  console.log("\n=== Deployment Complete ===");
  console.log("Verifier:", verifierAddress);
  console.log("BallotBox:", ballotBoxAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 4. Create .env (optional)

```bash
# For testnet/mainnet deployment
PRIVATE_KEY=your_private_key_here
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
```

### 5. Add to hardhat.config.js for testnet

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts"
  },
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  }
};
```

### 6. Compile Contracts

```bash
npx hardhat compile
```

### 7. Deploy to Local Hardhat Network

```bash
npx hardhat run scripts/deploy.js --network hardhat
```

### 8. Interact with the Contract

Create `scripts/submitBallot.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
  // Get the contract
  const ballotBoxAddress = "YOUR_BALLOTBOX_ADDRESS";
  const ballotBox = await ethers.getContractAt("BallotBox", ballotBoxAddress);
  
  // Get calldata from snarkjs export
  // Run: snarkjs zkey export soliditycalldata build/public.json build/proof.json
  const a = ["0x...", "0x..."];
  const b = [["0x...", "0x..."], ["0x...", "0x..."]];
  const c = ["0x...", "0x..."];
  const input = ["0x..."]; // ballotHash
  
  console.log("Submitting ballot...");
  const tx = await ballotBox.submitBallot(a, b, c, input);
  const receipt = await tx.wait();
  
  console.log("Ballot submitted!");
  console.log("Transaction:", receipt.hash);
  
  // Listen for event
  const event = receipt.logs.find(log => log.eventName === "BallotAccepted");
  if (event) {
    console.log("BallotHash:", event.args.ballotHash);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

---

## Common Pitfalls

### 1. Field Size / Bigints

**Problem:** Numbers in the circuit are in the field, not standard integers.

**Solution:**
- All inputs must be valid field elements (< 2^256)
- Use bigint or string representation in JSON
- BN128 field: ~2^256 but less than the prime

**Example:**
```json
// ✅ Valid
{ "candidate": "2" }

// ❌ Invalid - too large
{ "candidate": "21888242871839275222246405745257275088548364400416034343698204186575808495617" }
```

### 2. Matching Public Input Order

**Problem:** Verification fails because public inputs are in wrong order.

**Solution:**
- The circuit defines `{public [ballotHash]}` - only ballotHash is public
- `public.json` will have exactly one element: `[ballotHash]`
- When calling Solidity, pass as `uint256[1] memory input`

**In Solidity:**
```solidity
uint256[1] memory input;
input[0] = ballotHash;
```

### 3. Redeploy Verifier if Circuit Changes

**Problem:** Old verifier doesn't work with new circuit.

**Solution:**
- Any change to BasicVote.circom requires:
  1. New trusted setup
  2. New zkey
  3. New verifier contract
  4. Redeploy BallotBox with new verifier

### 4. circomlib Version Compatibility

**Problem:** Poseidon or other functions don't work.

**Solution:**
- Use circomlib version compatible with your circom version
- For Circom 2.0.0+, use circomlib v2.x
- Check: `npm list circomlib`

### 5. Ensuring Poseidon Parameters Match

**Problem:** Different Poseidon configurations produce different hashes.

**Solution:**
- circomlib's Poseidon uses standard parameters (N=2, rate=8)
- Don't change the Poseidon configuration
- Always use `include "circomlib/poseidon.circom"`
- The hash is: H(candidate, vote, salt) with 3 inputs

### 6. Wrong Input Format in JSON

**Problem:** Circuit fails to compile witness.

**Solution:**
- All numbers as strings
- No trailing commas
- Valid JSON

```json
// ✅ Correct
{
  "candidate": "2",
  "vote": "1",
  "salt": "1234567890123456789012345678901234567890123456789012345678901234"
}

// ❌ Wrong - number instead of string
{
  "candidate": 2,
  "vote": 1,
  "salt": 12345
}
```

### 7. Gas Costs

**Problem:** Verification costs too much gas.

**Solution:**
- Groth16 verification is relatively expensive (~300k gas)
- Consider batching verifications
- Use Solidity optimizer: `solc --optimize`

### 8. Trusted Setup Security

**Problem:** Using toy setup in production.

**Solution:**
- For production, use established MPC ceremonies
- Don't use your local setup for real votes
- Real ceremonies: Perpetual Powers of Tau, etc.

---

## Quick Reference Commands

```bash
# Full workflow - compilation to deployment

# 1. Compile
circom BasicVote.circom --r1cs --wasm --sym -o build

# 2. Powers of Tau
snarkjs powersoftau new bn128 15 build/tau.ptau -v
snarkjs powersoftau contribute build/tau.ptau build/tau_final.ptau -v -e="entropy"

# 3. Groth16 setup
snarkjs groth16 setup build/BasicVote.r1cs build/tau_final.ptau build/BasicVote_0000.zkey
snarkjs zkey contribute build/BasicVote_0000.zkey build/BasicVote_0001.zkey -v -e="entropy"

# 4. Export keys
snarkjs zkey export verificationkey build/BasicVote_0001.zkey build/verification_key.json

# 5. Generate proof
node build/BasicVote_js/generate_witness.js build/BasicVote_js/BasicVote.wasm input.json build/witness.json
snarkjs groth16 prove build/BasicVote_0001.zkey build/witness.json build/proof.json build/public.json

# 6. Verify locally
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json

# 7. Export verifier
snarkjs zkey export solidityverifier build/BasicVote_0001.zkey contracts/Verifier.sol

# 8. Get calldata for contract
snarkjs zkey export soliditycalldata build/public.json build/proof.json
```

---

## Conclusion

This guide covered:

1. ✅ A circuit that enforces boolean vote and valid candidate
2. ✅ Public ballotHash via Poseidon
3. ✅ Complete trusted setup workflow
4. ✅ Proof generation and local verification
5. ✅ Solidity verifier and BallotBox contracts
6. ✅ On-chain vs off-chain explanation
7. ✅ Transparency and privacy trade-offs
8. ✅ Third-party verification methods
9. ✅ Hardhat deployment
10. ✅ Common pitfalls

**Remember:** This is a demonstration! Real voting systems need:
- Eligibility verification (Merke trees, signatures)
- Anti-double-vote (nullifiers)
- Tally circuit (to count votes)
- Additional privacy features

---

## References

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs GitHub](https://github.com/iden3/snarkjs)
- [Circomlib](https://github.com/iden3/circomlib)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
