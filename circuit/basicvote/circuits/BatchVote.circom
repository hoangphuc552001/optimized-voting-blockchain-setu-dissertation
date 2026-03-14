pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./lib/StateTransition.circom";

template VoterMerkleProof(voterLevels) {
    signal input voterSecret;
    signal input pathElements[voterLevels];
    signal input pathIndices[voterLevels];
    signal output root;

    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== voterSecret;

    component proof = MerkleProof(voterLevels);
    proof.leaf <== leafHasher.out;
    for (var i = 0; i < voterLevels; i++) {
        proof.pathElements[i] <== pathElements[i];
        proof.pathIndices[i] <== pathIndices[i];
    }

    root <== proof.root;
}

template BatchVoteRollup(batchSize, voterLevels, stateLevels, numCandidates) {

    signal input preStateRoot;
    signal input postStateRoot;
    signal input batchNullifierHash;
    signal input voterMerkleRoot;

    signal input voterSecrets[batchSize];
    signal input electionIds[batchSize];
    signal input candidates[batchSize];
    signal input votes[batchSize];
    signal input salts[batchSize];
    signal input nullifierHashes[batchSize];
    signal input ballotHashes[batchSize];
    signal input isNoOp[batchSize];

    signal input voterPathElements[batchSize][voterLevels];
    signal input voterPathIndices[batchSize][voterLevels];

    signal input stateLeafIndices[batchSize];
    signal input stateOldValues[batchSize];
    signal input stateNewValues[batchSize];
    signal input statePathElements[batchSize][stateLevels];

    signal intermediateRoots[batchSize + 1];
    intermediateRoots[0] <== preStateRoot;

    component voterProofs[batchSize];
    component nullifierHashers[batchSize];
    component ballotHashers[batchSize];
    component voteChecks[batchSize];
    component candidateChecks[batchSize];
    component stateTransitions[batchSize];

    signal candidateValid[batchSize];
    signal expectedVoterRoot[batchSize];
    signal actualVoterRoot[batchSize];
    signal expectedNullifier[batchSize];
    signal computedNullifier[batchSize];
    signal expectedBallot[batchSize];
    signal computedBallot[batchSize];
    signal noOpRoot[batchSize];
    signal realRoot[batchSize];

    for (var i = 0; i < batchSize; i++) {
        isNoOp[i] * (1 - isNoOp[i]) === 0;
        voteChecks[i] = Num2Bits(1);
        voteChecks[i].in <== votes[i];

        candidateChecks[i] = LessThan(32);
        candidateChecks[i].in[0] <== candidates[i];
        candidateChecks[i].in[1] <== numCandidates;

        candidateValid[i] <== isNoOp[i] + candidateChecks[i].out - isNoOp[i] * candidateChecks[i].out;
        candidateValid[i] === 1;

        voterProofs[i] = VoterMerkleProof(voterLevels);
        voterProofs[i].voterSecret <== voterSecrets[i];
        for (var j = 0; j < voterLevels; j++) {
            voterProofs[i].pathElements[j] <== voterPathElements[i][j];
            voterProofs[i].pathIndices[j] <== voterPathIndices[i][j];
        }

        expectedVoterRoot[i] <== (1 - isNoOp[i]) * voterMerkleRoot;
        actualVoterRoot[i] <== (1 - isNoOp[i]) * voterProofs[i].root;
        expectedVoterRoot[i] === actualVoterRoot[i];

        nullifierHashers[i] = Poseidon(2);
        nullifierHashers[i].inputs[0] <== voterSecrets[i];
        nullifierHashers[i].inputs[1] <== electionIds[i];

        expectedNullifier[i] <== (1 - isNoOp[i]) * nullifierHashes[i];
        computedNullifier[i] <== (1 - isNoOp[i]) * nullifierHashers[i].out;
        expectedNullifier[i] === computedNullifier[i];

        ballotHashers[i] = Poseidon(3);
        ballotHashers[i].inputs[0] <== candidates[i];
        ballotHashers[i].inputs[1] <== votes[i];
        ballotHashers[i].inputs[2] <== salts[i];

        expectedBallot[i] <== (1 - isNoOp[i]) * ballotHashes[i];
        computedBallot[i] <== (1 - isNoOp[i]) * ballotHashers[i].out;
        expectedBallot[i] === computedBallot[i];

        stateNewValues[i] === stateOldValues[i] + votes[i] * (1 - isNoOp[i]);

        stateTransitions[i] = StateTransition(stateLevels);
        stateTransitions[i].oldRoot <== intermediateRoots[i];
        stateTransitions[i].leafIndex <== stateLeafIndices[i];
        stateTransitions[i].oldValue <== stateOldValues[i];
        stateTransitions[i].newValue <== stateNewValues[i];
        for (var j = 0; j < stateLevels; j++) {
            stateTransitions[i].pathElements[j] <== statePathElements[i][j];
        }

        noOpRoot[i] <== isNoOp[i] * intermediateRoots[i];
        realRoot[i] <== (1 - isNoOp[i]) * stateTransitions[i].newRoot;
        intermediateRoots[i + 1] <== noOpRoot[i] + realRoot[i];
    }

    intermediateRoots[batchSize] === postStateRoot;

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

    component batchNullifierCommit = Poseidon(batchSize);
    for (var i = 0; i < batchSize; i++) {
        batchNullifierCommit.inputs[i] <== nullifierHashes[i];
    }
    batchNullifierCommit.out === batchNullifierHash;
}

component main {public [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]}
    = BatchVoteRollup(4, 10, 5, 5);
