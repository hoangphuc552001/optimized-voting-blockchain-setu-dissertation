pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * VoteProof — Layer 1: Individual Vote Circuit (voter-side)
 *
 * This circuit runs on the VOTER's device. It proves:
 * 1. The voter knows a secret whose hash is in the voter Merkle tree (eligibility)
 * 2. The nullifier is correctly computed (prevents double voting)
 * 3. The vote is valid (binary)
 * 4. The candidate is in valid range
 *
 * The voter's SECRET never leaves their device.
 * The operator only sees: nullifierHash, candidate, vote, voterMerkleRoot, electionId
 */
template VoteProof(voterLevels, numCandidates) {
    // === PRIVATE INPUTS (never leave voter's device) ===
    signal input voterSecret;
    signal input voterPathElements[voterLevels];
    signal input voterPathIndices[voterLevels];

    // === PUBLIC INPUTS (sent to operator) ===
    signal input nullifierHash;
    signal input candidate;
    signal input vote;
    signal input voterMerkleRoot;
    signal input electionId;

    // === CONSTRAINT 1: Voter Eligibility (Merkle Proof) ===
    // Compute leaf = Poseidon(voterSecret)
    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== voterSecret;

    // Walk up the Merkle tree
    signal computedHash[voterLevels + 1];
    computedHash[0] <== leafHasher.out;

    component switchers[voterLevels];
    component hashers[voterLevels];

    for (var i = 0; i < voterLevels; i++) {
        // Ensure pathIndex is binary
        voterPathIndices[i] * (1 - voterPathIndices[i]) === 0;

        switchers[i] = Switcher();
        switchers[i].sel <== voterPathIndices[i];
        switchers[i].L <== computedHash[i];
        switchers[i].R <== voterPathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;

        computedHash[i + 1] <== hashers[i].out;
    }

    // Verify computed root matches the public Merkle root
    computedHash[voterLevels] === voterMerkleRoot;

    // === CONSTRAINT 2: Nullifier Correctness ===
    // nullifier = Poseidon(voterSecret, electionId)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== voterSecret;
    nullifierHasher.inputs[1] <== electionId;
    nullifierHasher.out === nullifierHash;

    // === CONSTRAINT 3: Vote Validity ===
    // vote must be 0 or 1
    vote * (1 - vote) === 0;

    // === CONSTRAINT 4: Candidate Range ===
    // candidate must be < numCandidates
    component candidateCheck = LessThan(32);
    candidateCheck.in[0] <== candidate;
    candidateCheck.in[1] <== numCandidates;
    candidateCheck.out === 1;
}

/*
 * Main component: 10-level voter tree (1024 voters), 5 candidates
 * Public inputs: nullifierHash, candidate, vote, voterMerkleRoot, electionId
 */
component main {public [nullifierHash, candidate, vote, voterMerkleRoot, electionId]}
    = VoteProof(10, 5);
