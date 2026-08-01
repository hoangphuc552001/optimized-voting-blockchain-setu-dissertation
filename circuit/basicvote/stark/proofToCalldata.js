'use strict';
/**
 * Serialize a stark.prove() output into the StarkVerifier.Proof calldata shape
 * (ethers v6 tuple object form).
 */

const { toHex } = require('./merkle');

function proofToCalldata(proof) {
  const queries = proof.queries.map((q) => ({
    f0:  q.trace.f0,
    fB:  q.trace.fB,
    f2B: q.trace.f2B,
    proof0:  q.trace.proof0.map(toHex),
    proofB:  q.trace.proofB.map(toHex),
    proof2B: q.trace.proof2B.map(toHex),
    friFa:      q.fri.map((l) => l.fa),
    friFb:      q.fri.map((l) => l.fb),
    friProofA:  q.fri.map((l) => l.proofA.map(toHex)),
    friProofB:  q.fri.map((l) => l.proofB.map(toHex)),
  }));

  return {
    output:        proof.output,
    traceRoot:     toHex(proof.traceRoot),
    friFinalValue: proof.friFinalValue,
    friRoots:      proof.friRoots.map(toHex),
    queries,
  };
}

module.exports = { proofToCalldata };
