# Zero-Knowledge Voting System - Workflow Chart

```mermaid
flowchart TB
    subgraph Setup["🔧 Phase 1: System Setup"]
        direction TB
        A1["📄 Build Merkle Tree<br/>(voters.json)"]
        A2["⚙️ Compile Circom Circuit<br/>(BasicVote.circom)"]
        A3["🔐 Trusted Setup Phase 2<br/>(snarkjs powersoftau + groth16)"]
        A4["📜 Generate Solidity Verifier<br/>(Verifier.sol)"]
        A5["🚀 Deploy Contracts<br/>(Hardhat local node)"]
    end

    subgraph Voting["🗳️ Phase 2: Voting"]
        direction TB
        B1["▶️ Start Voting Phase"]
        B2["🔏 Generate ZK Proof<br/>(generateProof.js)"]
        B3["📝 Submit Ballot<br/>(submitBallot.js)"]
    end

    subgraph Tally["📊 Phase 3: Tallying"]
        direction TB
        C1["⏹️ End Voting Phase"]
        C2["👁️ Reveal Vote<br/>(revealVote.js)"]
        C3["🏁 Finalize Results<br/>(finalizeResults.js)"]
    end

    A1 --> A2
    A2 --> A3
    A3 --> A4
    A4 --> A5
    A5 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> C1
    C1 --> C2
    C2 --> C3

    style Setup fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style Voting fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style Tally fill:#fff3e0,stroke:#e65100,stroke-width:2px
```

## Detailed Flow Description

### Phase 1: System Setup
| Step | Command/Script | Description |
|------|----------------|-------------|
| 1 | `scripts/buildMerkleTree.js` | Build Merkle tree from `voters.json` |
| 2 | `circom BasicVote.circom` | Compile Circom circuit to R1CS & WASM |
| 3 | `snarkjs groth16 setup` | Trusted setup (Powers of Tau + zkey) |
| 4 | `snarkjs zkey export solidityverifier` | Generate Solidity verifier contract |
| 5 | `hardhat run scripts/deploy.js` | Deploy Verifier & Voting contracts |

### Phase 2: Voting
| Step | Command/Script | Description |
|------|----------------|-------------|
| 6 | `hardhat run scripts/startVoting.js` | Open voting period |
| 7 | `scripts/generateProof.js` | Generate ZK proof for voter's ballot |
| 8 | `hardhat run scripts/submitBallot.js` | Submit encrypted ballot to blockchain |

### Phase 3: Tallying
| Step | Command/Script | Description |
|------|----------------|-------------|
| 9 | `hardhat run scripts/endVoting.js` | Close voting period |
| 10 | `hardhat run scripts/revealVote.js` | Decrypt and reveal vote |
| 11 | `hardhat run scripts/finalizeResults.js` | Calculate final vote tally |

## Data Flow

```mermaid
sequenceDiagram
    participant V as Voter
    participant MT as Merkle Tree
    participant C as Circom Circuit
    participant TS as Trusted Setup
    participant BC as Blockchain
    participant SC as Smart Contracts

    V->>MT: voters.json
    MT->>MT: Build Merkle Tree
    MT-->>V: merkleProofs.json

    C->>C: Compile circuit
    TS->>TS: Generate zkey & verification key
    TS-->>SC: Verifier.sol

    V->>V: Generate ballot & nullifier
    V->>C: Input (vote, candidate, proof)
    C-->>V: ZK Proof (π)

    V->>BC: Submit {ballotHash, nullifierHash, proof}
    BC->>SC: Verify proof
    SC-->>BC: ✓ Valid
    BC->>V: Transaction confirmed

    BC->>SC: endVoting()
    BC->>SC: revealVote()
    SC-->>BC: Vote revealed
    BC->>SC: finalizeResults()
    SC-->>BC: Final tally
```
