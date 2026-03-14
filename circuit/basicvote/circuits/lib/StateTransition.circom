pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/switcher.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    component switchers[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        switchers[i] = Switcher();
        switchers[i].sel <== pathIndices[i];
        switchers[i].L <== hashes[i];
        switchers[i].R <== pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

template StateTransition(stateLevels) {
    signal input oldRoot;
    signal output newRoot;
    signal input leafIndex;
    signal input oldValue;
    signal input newValue;
    signal input pathElements[stateLevels];

    signal indexBits[stateLevels];
    component n2b = Num2Bits(stateLevels);
    n2b.in <== leafIndex;
    for (var i = 0; i < stateLevels; i++) {
        indexBits[i] <== n2b.out[i];
    }

    component oldProof = MerkleProof(stateLevels);
    component oldLeafHash = Poseidon(1);
    oldLeafHash.inputs[0] <== oldValue;
    oldProof.leaf <== oldLeafHash.out;
    for (var i = 0; i < stateLevels; i++) {
        oldProof.pathElements[i] <== pathElements[i];
        oldProof.pathIndices[i] <== indexBits[i];
    }
    oldProof.root === oldRoot;

    component newProof = MerkleProof(stateLevels);
    component newLeafHash = Poseidon(1);
    newLeafHash.inputs[0] <== newValue;
    newProof.leaf <== newLeafHash.out;
    for (var i = 0; i < stateLevels; i++) {
        newProof.pathElements[i] <== pathElements[i];
        newProof.pathIndices[i] <== indexBits[i];
    }
    newRoot <== newProof.root;
}
