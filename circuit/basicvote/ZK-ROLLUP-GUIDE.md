# ZK Rollup Voting System — Architecture Guide

## From Per-Vote L1 Proofs to Batched Rollup Verification

---

## Table of Contents

1. [Why a ZK Rollup?](#why-a-zk-rollup)
2. [High-Level Architecture](#high-level-architecture)
3. [System Components](#system-components)
4. [Circuit Design](#circuit-design)
5. [Off-Chain Rollup Operator](#off-chain-rollup-operator)
6. [State Tree Management](#state-tree-management)
7. [Batching & Proof Generation](#batching--proof-generation)
8. [Layer 1 Contracts](#layer-1-contracts)
9. [End-to-End Flow](#end-to-end-flow)
10. [Gas Comparison](#gas-comparison)
11. [Security Model](#security-model)
12. [File Structure](#file-structure)
13. [Implementation Roadmap](#implementation-roadmap)

---

## Why a ZK Rollup?

### Current System (Per-Vote L1 Proof)

In the existing `BasicVote.circom` + `BallotBox.sol` design, **every individual vote** triggers a full Groth16 proof verification on Layer 1:

```
Voter 1 → generate proof → submitBallot() → L1 verifies proof  (~300k gas)
Voter 2 → generate proof → submitBallot() → L1 verifies proof  (~300k gas)
Voter 3 → generate proof → submitBallot() → L1 verifies proof  (~300k gas)
...
N voters → N separate L1 transactions → N × ~300k gas
```

**Problem:** At 1,000 voters, this costs **~300M gas** — roughly 10+ full Ethereum blocks at current gas limits.

### ZK Rollup Design (Batched Proof)

With a rollup, hundreds of votes are processed off-chain and compressed into a **single proof** submitted to L1:

```
Voter 1 ─┐
Voter 2 ─┤
Voter 3 ─┼── Rollup Operator (off-chain) ── single proof ── L1 verifies once (~300k gas)
...       │
Voter N ─┘
```

**Result:** A batch of 4 votes costs roughly the same gas as a single vote in the old system.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              LAYER 1 (Ethereum)                                       │
│                                                                                       │
│  ┌─────────────────────┐    ┌────────────────────────────────────────────────────┐   │
│  │  BatchVerifier.sol  │    │  VotingRollup.sol                                   │   │
│  │  (Groth16 verify)   │    │  - stateRoot (current Merkle root)                │   │
│  │                     │◄───│  - voterMerkleRoot                                 │   │
│  │  Auto-generated     │    │  - submitBatch()                                   │   │
│  │  from snarkjs        │    │  - nullifier registry                              │   │
│  └─────────────────────┘    └────────────────────────────────────────────────────┘   │
│                                     ▲                                                 │
└─────────────────────────────────────┼───────────────────────────────────────────────┘
                                      │  submitBatch(proof, newStateRoot,
                                      │               batchNullifierHash, voterMerkleRoot)
                                      │
┌─────────────────────────────────────┼───────────────────────────────────────────────┐
│                         ROLLUP OPERATOR (Off-Chain)                                  │
│                                                                                       │
│  ┌───────────────┐    ┌─────────────┐    ┌──────────────────────────────────────┐    │
│  │ Vote Mempool  │───►│   Batcher   │───►│         Prover                      │    │
│  │               │    │             │    │  (snarkjs/rapidsnark)               │    │
│  │ Collect votes │    │ Assemble    │    │                                      │    │
│  │ with per-vote │    │ batch of 4  │    │  Runs BatchVote.circom              │    │
│  │ proofs        │    │ votes       │    │  Produces single proof              │    │
│  └───────────────┘    └─────────────┘    └──────────────────────────────────────┘    │
│                                │                                                         │
│                                ▼                                                         │
│                    ┌───────────────────────┐                                          │
│                    │    State Tree         │                                          │
│                    │  (Poseidon SMT)       │                                          │
│                    │  - Tally counters     │                                          │
│                    │  - Nullifier flags    │                                          │
│                    └───────────────────────┘                                          │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │  signed vote + per-vote ZK proof
┌─────────────────────────────────────┼───────────────────────────────────────────────┐
│                                 VOTERS (Client)                                       │
│                                                                                       │
│  ┌────────────────────────────────┐   ┌──────────────────────────────────────────┐    │
│  │ Generate per-vote proof        │   │ Submit to rollup operator               │    │
│  │ (BasicVote.circom)             │───│ via HTTP API                           │    │
│  │                                │   │                                        │    │
│  │ Prove: eligibility + vote      │   │ POST /api/vote                         │    │
│  └────────────────────────────────┘   └──────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           ZK ROLLUP VOTING FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

PHASE 1: SETUP (Once)
┌────────────────────────────────────────────────────────────────────────────────────┐
│  1. Register voters        → scripts/registerVoters.js                             │
│  2. Build Merkle tree     → scripts/buildMerkleTree.js                            │
│  3. Compile circuit       → circom circuits/BatchVote.circom                       │
│  4. Trusted setup         → snarkjs powersoftau + groth16 setup                    │
│  5. Generate verifier    → snarkjs zkey export solidityverifier                   │
│  6. Deploy contracts     → scripts/deployRollup.js                                 │
└────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
PHASE 2: VOTING (Per-Voter)
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Voter                                                                              │
│  ┌─────────────────┐      ┌──────────────────┐      ┌──────────────────────────┐  │
│  │ BasicVote.circom│      │ Generate Groth16 │      │ Submit to operator       │  │
│  │ per-vote proof  │─────►│ proof            │─────►│ POST /api/vote           │  │
│  └─────────────────┘      └──────────────────┘      └──────────────────────────┘  │
│                                                                                    │
│  Operator                                                                          │
│  ┌─────────────────┐      ┌──────────────────┐      ┌──────────────────────────┐  │
│  │ Receive vote    │─────►│ Validate proof  │─────►│ Add to mempool           │  │
│  │ via API         │      │ (snarkjs verify) │      │ (wait for batch=4)      │  │
│  └─────────────────┘      └──────────────────┘      └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
PHASE 3: BATCH PROCESSING (Automatic when batch full)
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Operator                                                                           │
│  ┌─────────────────┐      ┌──────────────────┐      ┌──────────────────────────┐  │
│  │ Assemble batch  │─────►│ Generate batch  │─────►│ Submit to L1             │  │
│  │ of 4 votes     │      │ proof            │      │ VotingRollup.submitBatch│  │
│  └─────────────────┘      └──────────────────┘      └──────────────────────────┘  │
│                                                                                    │
│  L1 Contract                                                                        │
│  ┌─────────────────┐      ┌──────────────────┐      ┌──────────────────────────┐  │
│  │ Verify proof   │─────►│ Register         │─────►│ Update state root       │  │
│  │ (BatchVerifier)│      │ nullifiers      │      │ Emit BatchSubmitted     │  │
│  └─────────────────┘      └──────────────────┘      └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
PHASE 4: FINALIZATION
┌────────────────────────────────────────────────────────────────────────────────────┐
│  1. End voting    → scripts/endVoting.js (or operator API)                         │
│  2. Get tally    → scripts/getTally.js or GET /api/tally                           │
│  3. Verify       → Off-chain state tree contains final tallies                      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### 1. Per-Vote Circuit (Existing — `BasicVote.circom`)

Your current circuit remains the **voter-side proof**. Each voter still generates a Groth16 proof locally that proves:

- They are in the voter Merkle tree (eligibility)
- Their nullifier is correctly derived (double-vote prevention)
- Their vote is valid (binary, valid candidate range)
- Their ballot hash is correctly computed

**No changes needed.** This circuit stays exactly as it is.

### 2. Batch Circuit (New — `BatchVote.circom`)

This is the **rollup circuit** that the operator runs. It takes a batch of N votes and proves all of them are valid in a single proof.

**Location:** `circuits/BatchVote.circom`

**Key Features:**
- Processes 4 votes per batch (configurable)
- 10 levels for voter Merkle tree (1024 voters)
- 5 levels for state tree (32 tally slots)
- Supports 5 candidates

### 3. State Transition Library (`StateTransition.circom`)

**Location:** `circuits/lib/StateTransition.circom`

Provides:
- `MerkleProof(levels)` - Standard Merkle proof verification
- `StateTransition(stateLevels)` - Single vote state update

### 4. Rollup Operator (Off-Chain Server)

**Location:** `operator/index.js`

A Node.js service responsible for:
- **Collecting** signed votes and per-vote proofs from voters
- **Validating** each per-vote proof before accepting into the mempool
- **Batching** votes when 4 votes are collected (or timeout)
- **Computing** the state transition (update Merkle tree, tally)
- **Generating** the batch proof using `BatchVote.circom`
- **Submitting** the proof + new state root to L1

### 5. L1 Smart Contracts

| Contract | Location | Role |
|----------|----------|------|
| `BatchVerifier.sol` | `contracts/BatchVerifier.sol` | Auto-generated Groth16 verifier for `BatchVote.circom` |
| `VotingRollup.sol` | `contracts/VotingRollup.sol` | Stores current state root, verifies batch proofs, updates state |
| `MockBatchVerifier.sol` | `contracts/MockBatchVerifier.sol` | Mock verifier for testing |

---

## Circuit Design

### Per-Vote Circuit (Unchanged)

```
BasicVote.circom (existing)
├── Private: voterSecret, electionId, pathElements[], pathIndices[]
├── Public:  merkleRoot, candidate, vote, salt, nullifierHash, ballotHash
└── Proves:  eligibility + valid vote + nullifier + ballot commitment
```

### Batch Circuit (`BatchVote.circom`)

The batch circuit processes N vote transitions within a single proof.

```circom
template BatchVoteRollup(batchSize, voterLevels, stateLevels, numCandidates) {

    // Public Inputs (4 total)
    signal input preStateRoot;        // State root BEFORE this batch
    signal input postStateRoot;       // State root AFTER this batch
    signal input batchNullifierHash;  // Poseidon hash of all nullifiers
    signal input voterMerkleRoot;     // Voter eligibility Merkle root

    // Per-Vote Private Inputs (arrays of size batchSize)
    signal input voterSecrets[batchSize];
    signal input electionIds[batchSize];
    signal input candidates[batchSize];
    signal input votes[batchSize];
    signal input salts[batchSize];
    signal input nullifierHashes[batchSize];
    signal input ballotHashes[batchSize];
    signal input isNoOp[batchSize];

    // Merkle proof paths
    signal input voterPathElements[batchSize][voterLevels];
    signal input voterPathIndices[batchSize][voterLevels];

    // State transition inputs
    signal input stateLeafIndices[batchSize];
    signal input stateOldValues[batchSize];
    signal input stateNewValues[batchSize];
    signal input statePathElements[batchSize][stateLevels];

    // ... constraint logic ...
}

component main {public [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]}
    = BatchVoteRollup(4, 10, 5, 5);
```

#### Key Design Decisions

| Decision | Value | Rationale |
|----------|-------|-----------|
| Batch size | 4 | Small for testing, can increase for production |
| Voter levels | 10 | Supports 1024 voters |
| State levels | 5 | Supports 32 tally slots (5 candidates + nullifiers) |
| Proof system | Groth16 | Smallest proof size (~200 bytes), cheapest on-chain |
| Hash function | Poseidon | Native to Circom, efficient in-circuit |
| Nullifier check | Pairwise | Guarantees no duplicate nullifiers within batch |

---

## Off-Chain Rollup Operator

### Operator Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  IDLE    │────►│ COLLECT  │────►│ VALIDATE │────►│ GENERATE │────►│ SUBMIT   │
│          │     │  VOTES   │     │  & BATCH │     │  PROOF   │     │  TO L1   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     ▲                                                                    │
     └────────────────────────────────────────────────────────────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vote` | POST | Submit a vote with per-vote proof |
| `/api/force-batch` | POST | Force batch processing |
| `/api/tally` | GET | Get current vote tallies |
| `/api/status` | GET | Operator status and state |

### Step-by-Step Operator Logic

**Step 1 — Receive a Vote**

A voter submits to the operator via POST `/api/vote`:

```json
{
  "nullifierHash": "0x1a2b...",
  "candidate": 2,
  "vote": 1,
  "ballotHash": "0x9f8e...",
  "proof": {
    "pi_a": ["0x...", "0x..."],
    "pi_b": [["0x...", "0x..."], ["0x...", "0x..."]],
    "pi_c": ["0x...", "0x..."]
  },
  "publicSignals": ["0x...", "0x...", "0x...", "0x...", "0x...", "0x..."]
}
```

**Step 2 — Validate Locally**

Before accepting into the mempool, the operator:
1. Verifies the per-vote Groth16 proof using `snarkjs.groth16.verify()`
2. Checks the nullifier has not been used (local database + L1 registry)
3. Verifies the Merkle root matches the current election's voter tree
4. Adds to the mempool if valid

**Step 3 — Assemble a Batch**

When 4 votes are in the mempool:
1. Select up to 4 votes from the mempool (FIFO)
2. If fewer than 4 votes, pad unused slots with **no-op** votes
3. Record the current `preStateRoot`

**Step 4 — Compute State Transition**

For each vote in the batch, the operator updates the off-chain Merkle tree:

```
State Tree Layout:
├── Leaf 0-4:     candidate tally counters (5 candidates)
└── Leaf 5-31:    reserved / padding

For vote (candidate=2, vote=1):
  1. Read tally leaf for candidate 2 → current count = 7
  2. Write tally leaf for candidate 2 → new count = 8
  3. Read nullifier leaf → must be 0
  4. Write nullifier leaf → set to 1
  5. Recompute Merkle root after each write
```

After processing all votes: the final root is `postStateRoot`.

**Step 5 — Generate Batch Proof**

```bash
# Build witness for BatchVote circuit
node build/BatchVote_js/generate_witness.js \
  build/BatchVote_js/BatchVote.wasm \
  batch_input.json \
  build/batch_witness.wtns

# Generate Groth16 proof
snarkjs groth16 prove \
  build/batch_0001.zkey \
  build/batch_witness.wtns \
  build/batch_proof.json \
  build/batch_public.json
```

**Step 6 — Submit to L1**

The operator calls `VotingRollup.submitBatch()` on L1 with:
- The Groth16 proof `(a, b, c)`
- Public inputs: `[preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]`
- The list of nullifier hashes (for L1 double-vote registry)

---

## State Tree Management

The state tree is a Poseidon-based Merkle Tree stored off-chain by the operator, with only the **root** committed on L1.

### Tree Structure

```
                         stateRoot
                        /          \
                   /                    \
              /                              \
        tally[0..4]                  [reserved]
        (candidates)
```

### State Transition Integrity

The batch circuit enforces the following for every vote in the batch:

1. **Read old leaf** — prove the current tally value exists at the expected position in `preStateRoot`
2. **Write new leaf** — update the value (tally + 1) and recompute the root
3. **Chain updates** — the post-root of vote `i` becomes the pre-root of vote `i+1`
4. **Final root** — after all votes, the root must equal the public `postStateRoot`

This makes it mathematically impossible for the operator to fabricate state transitions.

---

## Batching & Proof Generation

### Batch Assembly Strategy

| Strategy | Trigger | Trade-off |
|----------|---------|-----------|
| Size-based | Every 4 votes | Consistent proof cost; may wait for votes |
| Time-based | Every 60 seconds | Bounded latency; batches may be partially empty |
| Hybrid | Whichever comes first | Best balance of cost and latency |

**Implementation:** Hybrid — batch every 4 votes **or** every 60 seconds, whichever comes first. Pad unused slots with dummy (no-op) votes.

### Padding with No-Op Votes

When a batch has fewer than 4 actual votes, the remaining slots are filled with no-op votes:

```json
{
  "candidate": 0,
  "vote": 0,
  "nullifierHash": "0",
  "ballotHash": "0",
  "isNoOp": true,
  "voterSecret": "0",
  "electionId": "0",
  "salt": "0"
}
```

The circuit checks an `isNoOp` flag per vote:
- If `isNoOp = 1` → skip the state update (tally unchanged, nullifier not recorded)
- If `isNoOp = 0` → enforce all vote constraints and apply state update

### Proof Generation Pipeline

```
batch_input.json
      │
      ▼
┌─────────────────┐
│ Witness          │ ← circom WASM
│ Generation       │    ~5-30 seconds for batch of 4
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Proof            │ ← snarkjs groth16 prove
│ Generation       │    ~30-120 seconds for batch of 4
└────────┬────────┘
         │
         ▼
  batch_proof.json + batch_public.json
```

---

## Layer 1 Contracts

### `VotingRollup.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBatchVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[4] memory input  // [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]
    ) external view returns (bool);
}

contract VotingRollup {
    IBatchVerifier public verifier;

    uint256 public stateRoot;
    uint256 public voterMerkleRoot;
    uint256 public electionId;
    uint256 public batchCount;
    mapping(uint256 => bool) public nullifiers;
    bool public votingActive;
    address public admin;

    event BatchSubmitted(uint256 indexed batchIndex, uint256 preStateRoot, uint256 postStateRoot, uint256 voteCount);
    event VotingStarted(uint256 electionId);
    event VotingEnded(uint256 electionId, uint256 finalStateRoot, uint256 totalBatches);

    constructor(
        address _verifier,
        uint256 _initialStateRoot,
        uint256 _voterMerkleRoot,
        uint256 _electionId
    ) {
        verifier = IBatchVerifier(_verifier);
        stateRoot = _initialStateRoot;
        voterMerkleRoot = _voterMerkleRoot;
        electionId = _electionId;
        votingActive = true;
        admin = msg.sender;
        batchCount = 0;
        emit VotingStarted(_electionId);
    }

    function submitBatch(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256 newStateRoot,
        uint256 batchNullifierHash,
        uint256[] calldata nullifierList
    ) external onlyDuringVoting {
        uint256[4] memory publicInputs = [
            stateRoot,          // preStateRoot
            newStateRoot,       // postStateRoot
            batchNullifierHash, // batchNullifierHash
            voterMerkleRoot     // voterMerkleRoot
        ];

        require(verifier.verifyProof(a, b, c, publicInputs), "Invalid batch proof");

        for (uint256 i = 0; i < nullifierList.length; i++) {
            require(!nullifiers[nullifierList[i]], "Duplicate nullifier");
            nullifiers[nullifierList[i]] = true;
        }

        emit BatchSubmitted(batchCount, stateRoot, newStateRoot, nullifierList.length);
        stateRoot = newStateRoot;
        batchCount++;
    }

    function endVoting() external onlyAdmin {
        votingActive = false;
        emit VotingEnded(electionId, stateRoot, batchCount);
    }
}
```

### Key Design Points

| Feature | Detail |
|---------|--------|
| **State root chain** | Each batch's `preStateRoot` must equal the contract's current `stateRoot` |
| **Nullifier registry** | Nullifiers stored on L1 to prevent cross-batch double-voting |
| **Single verification** | Only one `verifyProof` call per batch (~300k gas) |
| **Data availability** | Nullifier list passed as calldata for reconstruction |

---

## End-to-End Flow

### Phase 1: Setup

```bash
# 1. Register voters
node scripts/registerVoters.js

# 2. Build voter Merkle Tree
node scripts/buildMerkleTree.js

# 3. Compile batch rollup circuit
circom circuits/BatchVote.circom --r1cs --wasm --sym -o build -l node_modules

# 4. Trusted setup (pot16 = 2^16 = ~65K constraints)
snarkjs powersoftau new bn128 16 build/pot16_0000.ptau -v
snarkjs powersoftau contribute build/pot16_0000.ptau build/pot16_0001.ptau --name="Batch contribution" -v -e="batch random entropy"
snarkjs powersoftau prepare phase2 build/pot16_0001.ptau build/pot16_final.ptau -v

# 5. Groth16 setup
snarkjs groth16 setup build/BatchVote.r1cs build/pot16_final.ptau build/batch_0000.zkey
snarkjs zkey contribute build/batch_0000.zkey build/batch_0001.zkey --name="Batch Contributor 1" -v -e="batch more random entropy"
snarkjs zkey export verificationkey build/batch_0001.zkey build/batch_verification_key.json

# 6. Generate Solidity verifier
snarkjs zkey export solidityverifier build/batch_0001.zkey contracts/BatchVerifier.sol

# 7. Deploy contracts
npx hardhat run scripts/deployRollup.js --network localhost
```

### Phase 2: Voting

```
┌─────────┐          ┌──────────────┐          ┌──────────────┐
│  Voter   │  POST    │   Rollup     │  batch   │     L1       │
│  Client  │ ──────►  │   Operator   │ ──────►  │   Contract   │
└─────────┘ vote +    └──────────────┘ proof +  └──────────────┘
            proof      validates,      state
                       collects,       root
                       batches
```

**Voter actions:**
1. Construct private inputs (voterSecret, electionId, candidate, vote, salt)
2. Generate per-vote proof with `BasicVote.circom`
3. Send `{proof, publicSignals, nullifierHash}` to the rollup operator API

**Operator actions:**
1. Verify per-vote proof locally (snarkjs)
2. Add to mempool
3. When batch threshold is reached (4 votes):
   a. Record `preStateRoot`
   b. Apply each vote to state tree → compute `postStateRoot`
   c. Generate batch proof (BatchVote.circom + snarkjs)
   d. Call `VotingRollup.submitBatch()` on L1

### Phase 3: Finalization

```
1. Operator calls endVoting() on L1 (or via script)
2. Final stateRoot contains the complete tally
3. Anyone can read the tally from GET /api/tally
4. L1 stateRoot serves as the cryptographic anchor for correctness
```

---

## Gas Comparison

| Metric | Current (Per-Vote L1) | ZK Rollup (Batch of 4) |
|--------|----------------------|------------------------|
| L1 txns per 4 votes | 4 | 1 |
| Verifier gas per batch | 4 × ~300k = **1.2M** | 1 × ~300k = **~300k** |
| Calldata cost (nullifiers) | 4 × ~5k = ~20k | ~20k (same data) |
| **Total L1 gas per 4 votes** | **~1.22M** | **~320k** |
| **Gas per vote** | **~300k** | **~80k** |
| **Reduction** | — | **~73%** |

> The dominant cost becomes calldata rather than verification, since only one proof is verified per batch.

### Scaling Projections

| Voters | Per-Vote L1 (gas) | Rollup w/ batch=4 (gas) | Savings |
|--------|-------------------|------------------------|---------|
| 4 | 1.2M | 320k | 73% |
| 100 | 30M | 320k × 25 = 8M | 73% |
| 1,000 | 300M | 320k × 250 = 80M | 73% |

---

## Security Model

### What the ZK Rollup Guarantees

✅ **Vote validity** — Every vote in the batch satisfies the circuit constraints (eligibility, valid candidate, binary vote)

✅ **No double voting** — Nullifiers are checked both intra-batch (in-circuit) and cross-batch (L1 mapping)

✅ **State integrity** — The L1 state root can only advance through a valid batch proof; the operator cannot fabricate transitions

✅ **Data availability** — Nullifiers are posted as L1 calldata; anyone can reconstruct the nullifier set

✅ **Voter privacy** — The batch proof reveals no information about individual votes; only aggregate state changes are visible

### What the Operator CAN Do (Liveness Risks)

⚠️ **Censor votes** — The operator can refuse to include a specific voter's vote in any batch

⚠️ **Delay batches** — The operator can wait arbitrarily long before submitting a batch

⚠️ **Go offline** — If the operator goes offline, no new batches can be submitted

### Mitigations for Operator Misbehavior

| Risk | Mitigation |
|------|------------|
| Censorship | Allow voters to submit directly to L1 as a fallback (escape hatch) |
| Delay | Time-lock mechanism: if no batch is submitted within T blocks, anyone can force-include |
| Offline | Decentralize the operator role or allow rotation of operators |
| Data withholding | Post full batch data as L1 calldata |

---

## File Structure

```
basicvote/
├── circuits/
│   ├── BasicVote.circom              # Existing per-vote circuit (unchanged)
│   ├── BatchVote.circom              # NEW: Rollup batch circuit
│   └── lib/
│       └── StateTransition.circom   # State update logic
│
├── contracts/
│   ├── Verifier.sol                  # Existing per-vote verifier
│   ├── BatchVerifier.sol             # NEW: Auto-generated batch verifier
│   ├── MockBatchVerifier.sol         # Mock verifier for testing
│   ├── BallotBox.sol                 # Existing (backward compat)
│   └── VotingRollup.sol              # NEW: Rollup state contract
│
├── operator/
│   ├── index.js                      # Main operator HTTP server
│   ├── mempool.js                    # Vote collection and validation
│   ├── batcher.js                    # Batch assembly and padding
│   ├── stateTree.js                  # Merkle Tree (off-chain)
│   ├── prover.js                     # Witness + proof generation
│   └── submitter.js                  # L1 transaction submission
│
├── scripts/
│   ├── registerVoters.js             # Register voters and generate secrets
│   ├── buildMerkleTree.js            # Build voter Merkle tree
│   ├── generateProof.js              # Generate per-vote proof
│   ├── generateBatchInput.js         # Build batch_input.json
│   ├── deployRollup.js               # Deploy rollup contracts
│   ├── submitBatchProof.js           # Submit batch to L1
│   └── getTally.js                   # Get final tally results
│
├── test/
│   └── VotingRollup.test.js          # Contract tests with gas benchmarks
│
├── merkleProofs.json                 # Voter Merkle proofs
├── voter-secrets.json                # Voter secrets (keep private!)
├── batch_input.json                  # Generated batch input
└── build/                            # Compiled artifacts
    ├── BatchVote.r1cs
    ├── BatchVote_js/
    ├── pot16_*.ptau
    ├── batch_*.zkey
    └── batch_verification_key.json
```

---

## Implementation Roadmap

### Stage 1 — Circuit Development

1. ✅ **State tree structure** — Defined in `StateTransition.circom`
2. ✅ **Merkle proof verification** — Implemented in `StateTransition.circom`
3. ✅ **State transition logic** — Single-vote update: read old leaf → write new leaf
4. ✅ **Batch circuit** — `BatchVote.circom` combines all sub-circuits
5. ✅ **No-op vote support** — Padding for partially-filled batches
6. ✅ **Nullifier uniqueness** — Pairwise inequality checks

### Stage 2 — Operator Development

1. ✅ **State tree library** — `operator/stateTree.js` with Poseidon hashing
2. ✅ **Mempool** — `operator/mempool.js` API endpoint to receive votes
3. ✅ **Batcher** — `operator/batcher.js` assembles batches, pads with no-ops
4. ✅ **Prover** — `operator/prover.js` shell out to snarkjs for proof generation
5. ✅ **Submitter** — `operator/submitter.js` constructs and sends L1 transaction

### Stage 3 — L1 Contract Development

1. ✅ **BatchVerifier.sol** — Generated via `snarkjs zkey export solidityverifier`
2. ✅ **VotingRollup.sol** — State root management, nullifier registry, batch submission
3. ✅ **Testing** — `test/VotingRollup.test.js` with gas benchmarks

### Stage 4 — Integration & Testing

1. ✅ **End-to-end test** — Voters → Operator → L1, verify final tally
2. ✅ **Gas benchmarks** — Measured in tests
3. ✅ **Integration** — Full flow script provided

---

## Steps to Run

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Compile the Batch Circuit

```bash
circom circuits/BatchVote.circom --r1cs --wasm --sym -o build -l node_modules
```

Verify compilation output:

```bash
snarkjs r1cs info build/BatchVote.r1cs
```

### Step 3: Trusted Setup (Powers of Tau + Circuit-Specific)

**Phase 1 — Powers of Tau:**

```bash
snarkjs powersoftau new bn128 16 build/pot16_0000.ptau -v
snarkjs powersoftau contribute build/pot16_0000.ptau build/pot16_0001.ptau --name="Batch contribution" -v -e="batch random entropy"
snarkjs powersoftau prepare phase2 build/pot16_0001.ptau build/pot16_final.ptau -v
```

**Phase 2 — Circuit-Specific Setup:**

```bash
snarkjs groth16 setup build/BatchVote.r1cs build/pot16_final.ptau build/batch_0000.zkey
snarkjs zkey contribute build/batch_0000.zkey build/batch_0001.zkey --name="Batch Contributor 1" -v -e="batch more random entropy"
snarkjs zkey export verificationkey build/batch_0001.zkey build/batch_verification_key.json
```

### Step 4: Generate the Solidity Verifier

```bash
snarkjs zkey export solidityverifier build/batch_0001.zkey contracts/BatchVerifier.sol
```

### Step 5: Compile and Deploy Contracts

**Compile all Solidity contracts:**

```bash
npx hardhat compile
```

**Start a local Hardhat node:**

```bash
npx hardhat node --hostname 127.0.0.1 --port 8547
```

**Deploy the rollup contracts:**

```bash
npx hardhat run scripts/deployRollup.js --network localhost
```

### Step 6: Generate Batch Input

```bash
node scripts/generateBatchInput.js
```

### Step 7: Generate Batch Proof

```bash
# Generate witness
node build/BatchVote_js/generate_witness.js build/BatchVote_js/BatchVote.wasm batch_input.json build/batch_witness.wtns

# Generate proof
snarkjs groth16 prove build/batch_0001.zkey build/batch_witness.wtns build/batch_proof.json build/batch_public.json

# Verify locally
snarkjs groth16 verify build/batch_verification_key.json build/batch_public.json build/batch_proof.json
```

### Step 8: Submit Batch to L1

```bash
npx hardhat run scripts/submitBatchProof.js --network localhost
```

### Step 9: Get Tally Results

```bash
npx hardhat run scripts/getTally.js --network localhost
```

### Alternative: Use the Operator HTTP Server

```bash
# Start operator
node operator/index.js

# Submit votes
curl -X POST http://localhost:3000/api/vote -H "Content-Type: application/json" -d @vote.json

# Force batch
curl -X POST http://localhost:3000/api/force-batch

# Check tally
curl http://localhost:3000/api/tally

# Check status
curl http://localhost:3000/api/status
```

### Run Tests

```bash
npx hardhat test test/VotingRollup.test.js
```

---

## Quick Reference — Command Summary

| Stage | Command |
|-------|---------|
| Install deps | `npm install` |
| Compile circuit | `circom circuits/BatchVote.circom --r1cs --wasm --sym -o build -l node_modules` |
| Powers of Tau | `snarkjs powersoftau new bn128 16 build/pot16_0000.ptau -v` |
| Phase 2 setup | `snarkjs groth16 setup build/BatchVote.r1cs build/pot16_final.ptau build/batch_0000.zkey` |
| Export verifier | `snarkjs zkey export solidityverifier build/batch_0001.zkey contracts/BatchVerifier.sol` |
| Compile contracts | `npx hardhat compile` |
| Start local node | `npx hardhat node --hostname 127.0.0.1 --port 8547` |
| Deploy rollup | `npx hardhat run scripts/deployRollup.js --network localhost` |
| Generate batch input | `node scripts/generateBatchInput.js` |
| Generate batch proof | `snarkjs groth16 prove build/batch_0001.zkey build/batch_witness.wtns build/batch_proof.json build/batch_public.json` |
| Submit batch | `npx hardhat run scripts/submitBatchProof.js --network localhost` |
| Get tally | `npx hardhat run scripts/getTally.js --network localhost` |
| Start operator | `node operator/index.js` |
| Run tests | `npx hardhat test test/VotingRollup.test.js` |

---

> **Summary:** The ZK rollup redesign keeps your existing `BasicVote.circom` as the voter-side proof, adds a new `BatchVote.circom` that aggregates 4 votes into a single state transition proof, and replaces the per-vote L1 verification in `BallotBox.sol` with a single-batch-proof verification in `VotingRollup.sol`. The rollup operator runs off-chain, collecting votes, computing state transitions, and submitting batch proofs to L1 — reducing gas costs by ~73%.
