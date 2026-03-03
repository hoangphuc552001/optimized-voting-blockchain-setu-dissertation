pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/switcher.circom";

/*
 * Simple Merkle Tree Verifier for Voting
 * 
 * This circuit verifies that a voter's commitment (leaf) exists in the Merkle tree
 * without revealing the voter's identity or position in the tree.
 *
 * @param numLevels - Depth of the Merkle tree (e.g., 10 for 1024 leaves)
 * @param numCandidates - Number of candidates in the election
 */
template MerkleTreeVerifier(numLevels, numCandidates) {
    // ============ VOTER IDENTITY PROOF (Private Inputs) ============
    signal input voterSecret;                    // Voter's secret key
    signal input pathElements[numLevels];        // Sibling hashes along the path
    signal input pathIndices[numLevels];         // 0 if left child, 1 if right child

    // ============ PUBLIC INPUTS ============
    signal input merkleRoot;                     // Root of the Merkle tree (stored in contract)
    signal input candidate;                      // Voted candidate (0 to numCandidates-1)
    signal input vote;                           // Vote value (1 = for, 0 = against)
    signal input salt;                           // Random salt for vote obfuscation
    signal input ballotHash;                     // Hash of (candidate, vote, salt) - public input for nullifier

    // ============ PUBLIC OUTPUTS (None - all outputs are now public inputs) ============
    // Note: ballotHash is now a public input instead of output

    // ============ CONSTRAINT 1: Voter's Commitment Exists in Merkle Tree ============
    // First, compute the leaf from voter's secret
    // Leaf = Poseidon(voterSecret)
    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== voterSecret;

    // Intermediate hash values at each level
    signal computedHash[numLevels + 1];
    computedHash[0] <== leafHasher.out;

    // Components for each level - switchers to select left/right order
    component switchers[numLevels];
    component hashers[numLevels];

    // Process each level of the tree
    for (var i = 0; i < numLevels; i++) {
        // Ensure pathIndices[i] is binary (0 or 1)
        pathIndices[i] * (1 - pathIndices[i]) === 0;
        
        // Use switcher to order current and sibling based on pathIndex
        // If pathIndex = 0: left = computedHash[i], right = pathElements[i]
        // If pathIndex = 1: left = pathElements[i], right = computedHash[i]
        switchers[i] = Switcher();
        switchers[i].sel <== pathIndices[i];
        switchers[i].L <== computedHash[i];
        switchers[i].R <== pathElements[i];

        // Hash the pair to get the next level hash
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;

        computedHash[i + 1] <== hashers[i].out;
    }

    // ============ CONSTRAINT 2: Merkle Root Must Match ============
    computedHash[numLevels] === merkleRoot;

    // ============ CONSTRAINT 3: Vote Validity ============
    // vote must be binary (0 or 1)
    vote * (1 - vote) === 0;

    // candidate must be in valid range [0, numCandidates-1]
    component lessThan = LessThan(32);
    lessThan.in[0] <== candidate;
    lessThan.in[1] <== numCandidates;
    lessThan.out === 1;

    // ============ CONSTRAINT 4: Generate Ballot Hash (Nullifier) ============
    component ballotHasher = Poseidon(3);
    ballotHasher.inputs[0] <== candidate;
    ballotHasher.inputs[1] <== vote;
    ballotHasher.inputs[2] <== salt;
    
    // Verify that the public ballotHash matches the computed one
    ballotHasher.out === ballotHash;
}

/*
 * Main component with 10 levels (1024 voters) and 5 candidates
 * Public inputs: merkleRoot, candidate, vote, salt, ballotHash
 */
component main {public [merkleRoot, candidate, vote, salt, ballotHash]} = MerkleTreeVerifier(10, 5);
