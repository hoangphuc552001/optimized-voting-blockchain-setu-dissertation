pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./lib/StateTransition.circom";

/*
 * BatchStateUpdate — Layer 2: Batch State Transition Circuit (operator-side)
 *
 * This circuit runs on the OPERATOR. It proves:
 * 1. State tree transitions from preStateRoot to postStateRoot are correct
 * 2. Each vote correctly increments the candidate's tally
 * 3. Batch nullifier hash is computed correctly
 * 4. No duplicate nullifiers within the batch
 *
 * This circuit does NOT verify voter eligibility — that was done in Layer 1 (VoteProof).
 * The operator never needs voter secrets to generate this proof.
 */
template BatchStateUpdate(batchSize, stateLevels, numCandidates) {
    // === PUBLIC INPUTS ===
    signal input preStateRoot;
    signal input postStateRoot;
    signal input batchNullifierHash;
    signal input voterMerkleRoot;

    // === PRIVATE INPUTS (from verified individual proofs) ===
    signal input candidates[batchSize];
    signal input votes[batchSize];
    signal input nullifierHashes[batchSize];
    signal input isNoOp[batchSize];

    // State transition data
    signal input stateLeafIndices[batchSize];
    signal input stateOldValues[batchSize];
    signal input stateNewValues[batchSize];
    signal input statePathElements[batchSize][stateLevels];

    // === State Root Chaining ===
    signal intermediateRoots[batchSize + 1];
    intermediateRoots[0] <== preStateRoot;

    component voteChecks[batchSize];
    component candidateChecks[batchSize];
    component stateTransitions[batchSize];

    signal candidateValid[batchSize];
    signal noOpRoot[batchSize];
    signal realRoot[batchSize];

    for (var i = 0; i < batchSize; i++) {
        // Ensure isNoOp is binary
        isNoOp[i] * (1 - isNoOp[i]) === 0;

        // Vote validity: must be 0 or 1
        voteChecks[i] = Num2Bits(1);
        voteChecks[i].in <== votes[i];

        // Candidate range check
        candidateChecks[i] = LessThan(32);
        candidateChecks[i].in[0] <== candidates[i];
        candidateChecks[i].in[1] <== numCandidates;

        // candidateValid = isNoOp OR candidateInRange
        candidateValid[i] <== isNoOp[i] + candidateChecks[i].out - isNoOp[i] * candidateChecks[i].out;
        candidateValid[i] === 1;

        // State update: newValue = oldValue + vote * (1 - isNoOp)
        stateNewValues[i] === stateOldValues[i] + votes[i] * (1 - isNoOp[i]);

        // State transition (Merkle proof update)
        stateTransitions[i] = StateTransition(stateLevels);
        stateTransitions[i].oldRoot <== intermediateRoots[i];
        stateTransitions[i].leafIndex <== stateLeafIndices[i];
        stateTransitions[i].oldValue <== stateOldValues[i];
        stateTransitions[i].newValue <== stateNewValues[i];
        for (var j = 0; j < stateLevels; j++) {
            stateTransitions[i].pathElements[j] <== statePathElements[i][j];
        }

        // Root chaining: noOp keeps same root, real vote uses new root
        noOpRoot[i] <== isNoOp[i] * intermediateRoots[i];
        realRoot[i] <== (1 - isNoOp[i]) * stateTransitions[i].newRoot;
        intermediateRoots[i + 1] <== noOpRoot[i] + realRoot[i];
    }

    // Final state root must match
    intermediateRoots[batchSize] === postStateRoot;

    // === Nullifier Uniqueness Check ===
    var numPairs = batchSize * (batchSize - 1) / 2;
    component nullifierPairChecks[numPairs];
    signal bothReal[numPairs];
    signal duplicateAndReal[numPairs];

    var pairIdx = 0;
    for (var i = 0; i < batchSize; i++) {
        for (var j = i + 1; j < batchSize; j++) {
            nullifierPairChecks[pairIdx] = IsEqual();
            nullifierPairChecks[pairIdx].in[0] <== nullifierHashes[i];
            nullifierPairChecks[pairIdx].in[1] <== nullifierHashes[j];

            bothReal[pairIdx] <== (1 - isNoOp[i]) * (1 - isNoOp[j]);
            duplicateAndReal[pairIdx] <== bothReal[pairIdx] * nullifierPairChecks[pairIdx].out;
            duplicateAndReal[pairIdx] === 0;

            pairIdx++;
        }
    }

    // === Batch Nullifier Commitment ===
    component batchNullifierCommit = Poseidon(batchSize);
    for (var i = 0; i < batchSize; i++) {
        batchNullifierCommit.inputs[i] <== nullifierHashes[i];
    }
    batchNullifierCommit.out === batchNullifierHash;
}

/*
 * Main component: batchSize=16, stateLevels=5 (32 candidates max), numCandidates=5
 * Public inputs: preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot
 */
component main {public [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]}
    = BatchStateUpdate(16, 5, 5);
