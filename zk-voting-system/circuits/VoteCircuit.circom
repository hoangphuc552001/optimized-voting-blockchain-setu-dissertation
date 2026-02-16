// SPDX-License-Identifier: MIT
pragma circom 2.0.0;

include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/mux1.circom";
include "./node_modules/circomlib/circuits/comparators.circom";

/**
 * ZK Voting Circuit
 * 
 * This circuit proves that:
 * 1. The voter is registered in the Merkle tree of eligible voters
 * 2. The voter hasn't voted before (nullifier check)
 * 3. The vote is for a valid candidate
 * 4. The vote commitment is correctly computed
 * 
 * SECURITY NOTES:
 * - Uses Poseidon hash for ZK-friendly operations
 * - Maintains voter privacy through zero-knowledge proofs
 * - Prevents double voting through nullifiers
 */

/**
 * Merkle Tree Inclusion Proof Component
 * Verifies that a leaf exists in a Merkle tree
 */
template MerkleTreeInclusion(tree_depth) {
    signal input leaf;
    signal input root;
    signal input pathIndices[tree_depth];
    signal input pathElements[tree_depth];
    
    signal output out;
    
    component hashers[tree_depth];
    signal levels[tree_depth + 1];
    
    levels[0] <== leaf;
    
    for (var i = 0; i < tree_depth; i++) {
        hashers[i] = Poseidon(2);
        
        // Choose left or right based on path index
        hashers[i].inputs[0] <== pathIndices[i] == 0 ? levels[i] : pathElements[i];
        hashers[i].inputs[1] <== pathIndices[i] == 0 ? pathElements[i] : levels[i];
        
        levels[i + 1] <== hashers[i].out;
    }
    
    // Verify root matches
    root === levels[tree_depth];
    
    out <== 1;
}

/**
 * Vote Commitment Calculator
 * Computes the vote commitment from vote data and secret
 */
template VoteCommitment() {
    signal input voteOption;      // Candidate ID
    signal input secret;          // Voter's secret
    signal input nullifier;      // Unique nullifier
    signal input salt;           // Random salt for uniqueness
    
    signal output out;
    
    // Poseidon hash of (voteOption, secret, nullifier, salt)
    component hasher = Poseidon(4);
    hasher.inputs[0] <== voteOption;
    hasher.inputs[1] <== secret;
    hasher.inputs[2] <== nullifier;
    hasher.inputs[3] <== salt;
    
    out <== hasher.out;
}

/**
 * Nullifier Calculator
 * Computes unique nullifier to prevent double voting
 */
template NullifierCalculator() {
    signal input secret;          // Voter's secret
    signal input electionId;      // Election identifier
    
    signal output out;
    
    // Poseidon hash of (secret, electionId)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== electionId;
    
    out <== hasher.out;
}

/**
 * Main Vote Circuit
 * Proves a single valid vote
 */
template VoteCircuit(tree_depth, max_candidates) {
    // Public inputs (visible on-chain)
    signal input stateRoot;           // Current Merkle root of registered voters
    signal input newStateRoot;        // New Merkle root after this vote
    signal input voteCommitment;       // Commitment to this vote
    signal input nullifier;           // Nullifier for this vote
    signal input candidateId;         // Voted candidate (public for transparency)
    signal input electionId;          // Election identifier
    
    // Private inputs (only known to voter and prover)
    signal input voterSecret;         // Voter's secret key
    signal input voterIndex;          // Voter's position in Merkle tree
    signal input voterMerkleProof[tree_depth];  // Merkle path to root
    signal input salt;                // Random salt for vote commitment
    
    // Verify candidate is valid
    component candidateValid = LessThan(32);
    candidateValid.in[0] <== candidateId;
    candidateValid.in[1] <== max_candidates;
    candidateValid.out === 1;
    
    // Compute expected vote commitment
    component voteCommCalc = VoteCommitment();
    voteCommCalc.voteOption <== candidateId;
    voteCommCalc.secret <== voterSecret;
    voteCommCalc.nullifier <== nullifier;
    voteCommCalc.salt <== salt;
    
    // Verify commitment matches
    voteCommCalc.out === voteCommitment;
    
    // Compute expected nullifier
    component nullifierCalc = NullifierCalculator();
    nullifierCalc.secret <== voterSecret;
    nullifierCalc.electionId <== electionId;
    
    // Verify nullifier matches
    nullifierCalc.out === nullifier;
    
    // Verify voter is in the Merkle tree
    component merkleVerify = MerkleTreeInclusion(tree_depth);
    merkleVerify.leaf <== voterSecret;  // Use secret as leaf (could also use Poseidon(secret, index))
    merkleVerify.root <== stateRoot;
    
    for (var i = 0; i < tree_depth; i++) {
        merkleVerify.pathIndices[i] <== (voterIndex >> i) & 1;
        merkleVerify.pathElements[i] <== voterMerkleProof[i];
    }
    
    // Output new state root (for chaining)
    signal output newRootOut;
    newRootOut <== newStateRoot;
}

/**
 * Batch Vote Circuit
 * Processes multiple votes in a single batch for efficiency
 */
template BatchVoteCircuit(tree_depth, batch_size, max_candidates) {
    // Public inputs
    signal input oldStateRoot;
    signal input newStateRoot;
    signal input voteCommitments[batch_size];
    signal input nullifiers[batch_size];
    signal input candidateIds[batch_size];
    signal input electionId;
    
    // Private inputs - arrays
    signal input voterSecrets[batch_size];
    signal input voterIndices[batch_size];
    signal input voterMerkleProofs[batch_size][tree_depth];
    signal input salts[batch_size];
    
    // Process each vote
    component voters[batch_size];
    
    for (var i = 0; i < batch_size; i++) {
        voters[i] = VoteCircuit(tree_depth, max_candidates);
        
        voters[i].stateRoot <== oldStateRoot;
        voters[i].newStateRoot <== i == batch_size - 1 ? newStateRoot : 0;  // Only last vote outputs new root
        voters[i].voteCommitment <== voteCommitments[i];
        voters[i].nullifier <== nullifiers[i];
        voters[i].candidateId <== candidateIds[i];
        voters[i].electionId <== electionId;
        
        voters[i].voterSecret <== voterSecrets[i];
        voters[i].voterIndex <== voterIndices[i];
        voters[i].salt <== salts[i];
        
        for (var j = 0; j < tree_depth; j++) {
            voters[i].voterMerkleProofs[j] <== voterMerkleProofs[i][j];
        }
    }
}

// Instantiate main circuit with reasonable defaults
// Tree depth 20 supports ~1 million voters
// Batch size 10 for demonstration
component main = VoteCircuit(20, 10);
