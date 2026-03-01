# Merkle Tree Interactive Demonstration

A visual, interactive demonstration of how Merkle trees work - a fundamental data structure used in blockchain systems and zero-knowledge proofs.

## Features

- **Add Data Items**: Insert any data to build your Merkle tree
- **Visual Tree Construction**: Watch the tree grow as you add items
- **Hash Visualization**: See how each hash is computed at every level
- **Merkle Proof Generation**: Generate proofs for any data item
- **Proof Verification**: Verify that a piece of data belongs to a Merkle root

## How to Use

1. Open `index.html` in any modern web browser
2. Add data items using the input field
3. Click "Add" to insert items into the tree
4. Watch the tree visualize automatically
5. Click on any item to generate a Merkle proof
6. Use the verification section to validate proofs

## Understanding Merkle Trees

A Merkle tree is a binary tree where:
- **Leaf nodes** are hashes of data blocks
- **Non-leaf nodes** are hashes of their children's hashes
- **Root hash** (Merkle root) represents all data in the tree

### Key Properties
- **Integrity**: Changing any data item changes the root
- **Efficiency**: Verify membership in O(log n) time
- **Privacy**: Prove data inclusion without revealing all data

### Use Cases
- Blockchain transaction verification
- Bitcoin and Ethereum use Merkle trees
- Zero-knowledge proofs (zk-SNARKs)
- Distributed file systems
- Certificate transparency logs
