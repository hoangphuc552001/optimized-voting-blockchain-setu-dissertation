# ZK Rollup Layer 2 Voting System - Architecture Design

## Executive Summary

This document outlines the architecture for scaling your blockchain voting system using Zero-Knowledge Rollups (ZK Rollups). The implementation moves vote processing from Layer 1 (high gas, slow) to Layer 2 (low cost, fast) while maintaining L1 security guarantees through cryptographic proofs.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ZK ROLLUP VOTING SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   LAYER 2 (Off-Chain - Fast, Low Cost)                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  L2 Sequencer                                                    │   │
│   │  ├── Collects votes from users (off-chain transactions)         │   │
│   │  ├── Batches votes into groups (e.g., 1000 votes per batch)      │   │
│   │  ├── Computes new Merkle state root                              │   │
│   │  └── Generates ZK proof (validity proof)                         │   │
│   │                                                                   │   │
│   │  L2 State                                                         │   │
│   │  ├── Vote commitments (Merkle tree of vote hashes)               │   │
│   │  ├── Vote counts per candidate                                   │   │
│   │  └── Nullifier set (prevent double voting)                       │   │
│   │                                                                   │   │
│   │  User Interface                                                   │   │
│   │  ├── Vote submission (signed message)                            │   │
│   │  ├── Vote commitment generation                                  │   │
│   │  └── Batch status monitoring                                      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    │ Submit Batch + ZK Proof           │
│                                    ▼                                    │
│   LAYER 1 (Ethereum/L1 - Secure, Final)                                │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  RollupGateway.sol                                               │   │
│   │  ├── Verifier Contract (verifies ZK proofs on-chain)             │   │
│   │  ├── State Root Registry (stores L2 state root commitments)     │   │
│   │  └── Vote Commitment Registry                                    │   │
│   │                                                                   │   │
│   │  Election.sol (Existing L1 Contract)                             │   │
│   │  ├── Voter Registration (on-chain)                               │   │
│   │  ├── Election Parameters (start/end time, candidates)           │   │
│   │  └── Final Results Verification                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 ZK Voting Circuit (Circom)

The circuit proves that:
- The voter is registered in the Merkle tree of eligible voters
- The voter hasn't voted before (nullifier check)
- The vote is for a valid candidate
- The circuit maintains privacy (doesn't reveal voter identity)

```circom
// VoteCircuit.circom
template VoteCircuit(tree_depth, num_candidates) {
    // Public inputs
    signal input stateRoot;           // Current Merkle root
    signal input newStateRoot;         // Updated Merkle root
    signal input voteCommitment;       // Hash of vote + secret
    signal input nullifier;           // Unique vote identifier
    signal input candidateId;         // Voted candidate
    
    // Private inputs (witness)
    signal input voterSecret;          // Voter's secret key
    signal input voterMerkleProof[tree_depth];  // Merkle path
    signal input voterIndex;          // Voter's position in tree
    
    // Verify voter is registered (Merkle proof)
    component leaf = Poseidon(2);
    leaf.inputs[0] <== voterSecret;
    leaf.inputs[1] <== nullifier;
    
    component merkleVerify = MerkleTreeInclusion(tree_depth);
    merkleVerify.leaf <== leaf.out;
    merkleVerify.root <== stateRoot;
    for (var i = 0; i < tree_depth; i++) {
        merkleVerify.pathIndices[i] <== (voterIndex >> i) & 1;
        merkleVerify.pathElements[i] <== voterMerkleProof[i];
    }
    
    // Verify nullifier hasn't been used (simplified)
    component nullifierHash = Poseidon(1);
    nullifierHash.inputs[0] <== nullifier;
    
    // Verify candidate is valid
    component candidateValid = LessThan(32);
    candidateValid.in[0] <== candidateId;
    candidateValid.in[1] <== num_candidates;
    candidateValid.out === 1;
    
    // Update state root (simplified)
    signal output out;
    out <== newStateRoot;
}
```

### 2.2 L2 Sequencer Service

**Responsibilities:**
- Collect signed vote messages from users
- Batch votes for efficient processing
- Generate ZK proofs
- Submit proofs to L1 RollupGateway

```typescript
// sequencer/types.ts
interface VoteMessage {
    voterAddress: string;
    candidateId: number;
    voteCommitment: string;      // Poseidon(vote, secret, nullifier)
    nullifier: string;            // PoseID(secret, salt)
    signature: string;           // EIP-712 signature
}

interface Batch {
    batchId: number;
    votes: VoteMessage[];
    oldStateRoot: string;
    newStateRoot: string;
    timestamp: number;
}

interface RollupProof {
    a: [string, string];         // Proof points
    b: [[string, string], [string, string]];
    c: [string, string];
    input: string[];            // Public inputs
}

// sequencer/sequencer.service.ts
class SequencerService {
    private pendingVotes: VoteMessage[] = [];
    private batchSize: number;
    private stateRoot: string;
    private gatewayContract: RollupGateway;
    
    constructor(gatewayAddress: string, batchSize: number = 100) {
        this.batchSize = batchSize;
        this.stateRoot = INITIAL_STATE_ROOT;
    }
    
    // Collect vote from user
    async submitVote(vote: VoteMessage): Promise<void> {
        // Verify signature
        const isValid = await this.verifySignature(vote);
        if (!isValid) throw new Error('Invalid vote signature');
        
        // Verify voter is registered on L1
        const isRegistered = await this.checkL1VoterRegistration(vote.voterAddress);
        if (!isRegistered) throw new Error('Voter not registered on L1');
        
        // Add to pending batch
        this.pendingVotes.push(vote);
        
        // Check if batch is ready
        if (this.pendingVotes.length >= this.batchSize) {
            await this.processBatch();
        }
    }
    
    // Process batch of votes
    async processBatch(): Promise<void> {
        const batch = this.pendingVotes.splice(0, this.batchSize);
        
        // Generate witness for circuit
        const witness = await this.generateWitness(batch);
        
        // Generate ZK proof
        const proof = await this.generateProof(witness);
        
        // Submit to L1
        await this.submitToL1(batch, proof);
    }
}
```

### 2.3 L1 Rollup Gateway Contract

```solidity
// RollupGateway.sol
contract RollupGateway {
    address public admin;
    uint256 public batchCount;
    
    // State roots from L2
    mapping(uint256 => bytes32) public stateRoots;
    mapping(uint256 => uint256) public batchTimestamps;
    
    // Verifier interface
    IVerifier public verifier;
    
    // Election configuration
    mapping(bytes32 => bool) public validVoteCommitments;
    mapping(bytes32 => bool) public usedNullifiers;
    
    // Events
    event BatchSubmitted(
        uint256 indexed batchId,
        bytes32 oldStateRoot,
        bytes32 newStateRoot,
        uint256 voteCount,
        uint256 timestamp
    );
    event BatchVerified(uint256 indexed batchId, bool success);
    
    constructor(address _verifier) {
        admin = msg.sender;
        verifier = IVerifier(_verifier);
    }
    
    /**
     * Submit a batch of votes with ZK proof
     */
    function submitBatch(
        uint256 _batchId,
        bytes32 _oldStateRoot,
        bytes32 _newStateRoot,
        uint256[8] calldata _proof,  // Groth16 proof points
        uint256[] calldata _publicInputs
    ) external {
        require(msg.sender == admin, "Only admin can submit batches");
        require(_batchId == batchCount, "Invalid batch ID");
        require(stateRoots[_batchId] == _oldStateRoot, "Invalid old state root");
        
        // Verify ZK proof on-chain
        bool isValid = verifier.verifyProof(_proof, _publicInputs);
        require(isValid, "Invalid ZK proof");
        
        // Update state
        stateRoots[_batchId] = _newStateRoot;
        batchTimestamps[_batchId] = block.timestamp;
        batchCount++;
        
        emit BatchSubmitted(_batchId, _oldStateRoot, _newStateRoot, _publicInputs[0], block.timestamp);
        emit BatchVerified(_batchId, true);
    }
    
    /**
     * Get current state root for L2 sequencer
     */
    function getCurrentStateRoot() external view returns (bytes32) {
        return stateRoots[batchCount - 1];
    }
}
```

---

## 3. Workflows

### 3.1 Voter Registration (L1)

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Voter       │     │  L1 Election   │     │  L2 State   │
│   (Wallet)    │     │  Contract      │     │  (Merkle)   │
└───────┬──────┘     └────────┬────────┘     └─────┬───────┘
        │                      │                   │
        │  1. Register (L1 Tx)  │                   │
        │───────────────────────►                   │
        │                      │                   │
        │                      │ 2. Store voter    │
        │                      │    commitment     │
        │                      │ ──────────────────┼──►
        │                      │                   │    (off-chain)
        │                      │                   │
        │   3. Registration    │                   │
        │   Confirmed          │                   │
        │◄──────────────────────                   │
        │                      │                   │
```

### 3.2 Vote Casting (L2 + ZK Proof)

```
┌──────────┐     ┌────────────┐     ┌─────────────┐     ┌───────────┐     ┌─────────┐
│  Voter   │     │  Sequencer │     │  ZK Circuit │     │ Prover    │     │ L1      │
│          │     │  (L2)      │     │             │     │ Service   │     │ Gateway │
└────┬─────┘     └─────┬──────┘     └──────┬──────┘     └─────┬─────┘     └───┬─────┘
     │                 │                    │                   │               │
     │ 1. Sign vote    │                    │                   │               │
     │    (off-chain)  │                    │                   │               │
     │────────────────►│                    │                   │               │
     │                 │                    │                   │               │
     │                 │ 2. Batch votes    │                   │               │
     │                 │    (e.g., 1000)    │                   │               │
     │                 │                    │                   │               │
     │                 │ 3. Generate        │                   │               │
     │                 │    witness         │                   │               │
     │                 │───────────────────►│                   │               │
     │                 │                    │                   │               │
     │                 │                    │ 4. Compute proof  │               │
     │                 │                    │◄──────────────────│               │
     │                 │                    │                   │               │
     │                 │ 5. Submit batch    │                   │               │
     │                 │    + proof + calldata                  │               │
     │                 │─────────────────────────────────────────────────────────►
     │                 │                    │                   │               │
     │                 │                    │                   │ 6. Verify proof       │
     │                 │                    │                   │◄─────────────────────│
     │                 │                    │                   │               │
     │                 │                    │                   │ 7. Update state root │
     │                 │                    │                   │◄─────────────────────│
     │                 │                    │                   │               │
     │   8. Vote       │                    │                   │               │
     │   confirmed     │                    │                   │               │
     │◄────────────────│                    │                   │               │
```

---

## 4. Performance Comparison

### Layer 1 vs ZK Rollup

| Metric | Layer 1 (Current) | ZK Rollup (Proposed) |
|--------|-------------------|----------------------|
| **Gas per vote** | ~50,000-100,000 gas | ~300-500 gas (L2) + ~200,000 gas (proof verification) |
| **Throughput** | ~15-30 TPS | ~1,000-10,000 TPS |
| **Finality** | ~12-15 seconds | ~10-15 min (L1 finality) |
| **Cost per vote** | $0.01-$0.10 (varies) | <$0.001 (L2) + L1 amortized |
| **Privacy** | Public | Partial (commitments) |
| **Setup complexity** | Simple | High (circuit, prover) |

### Cost Analysis (100,000 voters)

**Layer 1 (Current Implementation):**
- Gas per vote: ~65,000 gas
- Total gas for 100,000 votes: 6.5 billion gas
- At 50 gwei: 325 ETH (~$650,000 at $2,000/ETH)

**ZK Rollup (Proposed):**
- L2 transaction cost: ~300 gas
- Batch proof verification: ~200,000 gas
- 100 votes per batch: 100 * 300 + 200,000/100 = 2,000 gas/batch
- 1,000 batches: 2,000 * 1,000 = 2 million gas
- At 50 gwei: 0.1 ETH (~$200)

**Savings: ~99.9% on L1 gas costs**

---

## 5. Security Considerations

### 5.1 Threat Model

1. **Double Voting Prevention**
   - L1: `hasVoted` mapping in smart contract
   - L2: Nullifier set in ZK circuit + L1 nullifier registry

2. **Voter Eligibility**
   - L1: `isRegisteredVoter` mapping
   - L2: Merkle proof of voter registration

3. **Sequencer Liveness**
   - Multiple sequencers (decentralized)
   - Forced exit mechanism
   - Backup relay system

4. **Data Availability**
   - Full state data stored off-chain
   - Commitments/roots on-chain
   - Emergency withdrawal mechanism

### 5.2 Privacy Properties

- **Voter identity**: Protected (not revealed in proof)
- **Vote choice**: Partially protected (commitment reveals candidate)
- **Election integrity**: Maintained through cryptographic proofs

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Install and configure ZK toolchain (circom, snarkjs)
- [ ] Design and implement ZK voting circuit
- [ ] Generate proving/verification keys
- [ ] Deploy L1 RollupGateway contract

### Phase 2: L2 Infrastructure (Weeks 3-4)
- [ ] Implement Merkle tree utilities
- [ ] Build Sequencer service
- [ ] Create witness generation pipeline
- [ ] Implement proof submission logic

### Phase 3: Integration (Weeks 5-6)
- [ ] Connect L2 voting to frontend
- [ ] Implement vote signing/verification
- [ ] Add batch status monitoring
- [ ] Create performance benchmarking

### Phase 4: Testing & Optimization (Weeks 7-8)
- [ ] Security audit of circuit
- [ ] Gas optimization of contracts
- [ ] Performance tuning of prover
- [ ] Comparative analysis (L1 vs L2)

---

## 7. Dependencies & Tools

### Required
- `circom` - Circuit compiler
- `snarkjs` - ZK proof toolkit
- `circomlib` - Circuit primitives
- `circomlibjs` - Poseidon hash for Node.js
- `merkletreejs` - Merkle tree operations
- `ethers.js` - Blockchain interactions

### Recommended
- `hardhat` - Development framework
- `typescript` - Type safety
- `docker` - Reproducible builds

---

## 8. Next Steps

1. **Review this architecture** and confirm requirements
2. **Set up ZK development environment** (circom, snarkjs)
3. **Begin Phase 1 implementation** (circuit design)
4. **Create performance baseline** (current L1 metrics)

---

## Appendix A: Vote Message Format (EIP-712)

```typescript
const VOTE_DOMAIN = {
    name: 'ZK Voting System',
    version: '1.0',
    chainId: 31337, // Hardhat network
    verifyingContract: '0x...', // L2 contract address
};

const VOTE_TYPES = {
    Vote: [
        { name: 'candidateId', type: 'uint256' },
        { name: 'voteCommitment', type: 'bytes32' },
        { name: 'nullifier', type: 'bytes32' },
        { name: 'salt', type: 'bytes32' },
    ],
};

interface VoteData {
    candidateId: number;
    voteCommitment: string;
    nullifier: string;
    salt: string;
}
```

---

## Appendix B: Merkle Tree Specification

- **Tree depth**: 32 (supports ~4 billion voters)
- **Hash function**: Poseidon (ZK-friendly)
- **Leaf structure**: `Poseidon(voterSecret, voterIndex)`
- **Update mechanism**: Incremental updates via proofs

---

*Document Version: 1.0*
*Last Updated: 2026-02-07*
