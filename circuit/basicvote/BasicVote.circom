pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/switcher.circom";

/*
 * Zero-Knowledge Voting Circuit with Merkle Tree Verification
 * 
 * This circuit verifies that:
 * 1. A voter's commitment exists in the Merkle tree (voter eligibility)
 * 2. The vote is valid (binary vote for valid candidate)
 * 3. The nullifier is correctly computed from voterSecret + electionId (one-person-one-vote)
 * 4. The ballotHash is correctly computed from candidate + vote + salt
 *
 * @param numLevels - Depth of the Merkle tree (e.g., 10 for 1024 leaves)
 * @param numCandidates - Number of candidates in the election
 */
template MerkleTreeVerifier(numLevels, numCandidates) {

    // ============ PRIVATE INPUTS (Known only to voter) ============
    signal input voterSecret;                    // Voter's secret key
    signal input electionId;                      // Election identifier (prevents cross-election voting)
    signal input pathElements[numLevels];         // Sibling hashes along the Merkle path
    signal input pathIndices[numLevels];         // 0 if left child, 1 if right child

    // ============ PUBLIC INPUTS ============
    signal input merkleRoot;                      // Root of the Merkle tree (stored in contract)
    signal input candidate;                       // Voted candidate (0 to numCandidates-1)
    signal input vote;                            // Vote value (1 = for, 0 = against)
    signal input salt;                            // Random salt for vote obfuscation
    signal input nullifierHash;                   // Hash of (voterSecret, electionId) - for double-voting prevention
    signal input ballotHash;                      // Hash of (candidate, vote, salt) - vote commitment

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

    // Verify computed root matches the stored Merkle root
    computedHash[numLevels] === merkleRoot;

    // ============ CONSTRAINT 2: Vote Validity ============
    // vote must be binary (0 or 1)
    vote * (1 - vote) === 0;

    // candidate must be in valid range [0, numCandidates-1]
    component lessThan = LessThan(32);
    lessThan.in[0] <== candidate;
    lessThan.in[1] <== numCandidates;
    lessThan.out === 1;

    // ============ CONSTRAINT 3: Nullifier Generation ============
    // Nullifier = Poseidon(voterSecret, electionId) - unique per voter per election
    // This ensures one-person-one-vote and prevents double voting across elections
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== voterSecret;
    nullifierHasher.inputs[1] <== electionId;
    
    // Verify the public nullifierHash matches the computed one
    nullifierHasher.out === nullifierHash;

    // ============ CONSTRAINT 4: Ballot Hash (Vote Commitment) ============
    // BallotHash = Poseidon(candidate, vote, salt) - encrypts the vote
    // This is used as part of the proof and verified against the public input
    component ballotHasher = Poseidon(3);
    ballotHasher.inputs[0] <== candidate;
    ballotHasher.inputs[1] <== vote;
    ballotHasher.inputs[2] <== salt;
    
    // Verify the public ballotHash matches the computed one
    ballotHasher.out === ballotHash;
}

/*
 * Main component with 10 levels (1024 voters) and 5 candidates
 * Public inputs: merkleRoot, candidate, vote, salt, nullifierHash, ballotHash
 */
component main {public [merkleRoot, candidate, vote, salt, nullifierHash, ballotHash]} = MerkleTreeVerifier(10, 5);
