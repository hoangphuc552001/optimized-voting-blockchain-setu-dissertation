pragma circom 2.0.0;

include "circomlib_circuits/poseidon.circom";
include "circomlib_circuits/bitify.circom";


template BasicVote(numCandidates) {
    // Use enough bits to represent numCandidates (5 candidates = need 3 bits)
    var nBits = 32;
    
    signal input candidate;
    signal input vote;
    signal input salt;

    signal output ballotHash; // Public output - will be verified on-chain

    // CONSTRAINT 1: vote is boolean (0 or 1)
    vote * vote === vote;

    // CONSTRAINT 2: candidate is in valid range
    // Use LessThan to ensure candidate < numCandidates
    component lessThan = LessThan(nBits);
    lessThan.in[0] <== candidate;
    lessThan.in[1] <== numCandidates;
    lessThan.out === 1;

    // CONSTRAINT 3: Generate ballot hash
    // Use Poseidon hash: H(candidate, vote, salt)

    component poseidon = Poseidon(3);
    poseidon.inputs[0] <== candidate;
    poseidon.inputs[1] <== vote;
    poseidon.inputs[2] <== salt;
    
    ballotHash <== poseidon.out;
}

// a ballot with 5 candidates
component main = BasicVote(5);
