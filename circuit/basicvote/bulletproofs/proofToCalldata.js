'use strict';
/**
 * Serialize a rangeProof.prove() output into the uint256[23] flat array
 * that BPVerifier.verify() expects.
 *
 * Layout (indices 0-22):
 *   [0-1]   V
 *   [2-3]   A
 *   [4-5]   S
 *   [6-7]   T1
 *   [8-9]   T2
 *   [10]    tHat
 *   [11]    taux
 *   [12]    mu
 *   [13-14] L0 (ipaProof.L_vec[0])
 *   [15-16] L1 (ipaProof.L_vec[1])
 *   [17-18] R0 (ipaProof.R_vec[0])
 *   [19-20] R1 (ipaProof.R_vec[1])
 *   [21]    a_final
 *   [22]    b_final
 */
function proofToCalldata(proof) {
  const { V, A, S, T1, T2, tHat, taux, mu, ipaProof } = proof;
  const { L_vec, R_vec, a_final, b_final } = ipaProof;

  function pt(P) {
    const { x, y } = P.toAffine();
    return [x, y];
  }

  return [
    ...pt(V),
    ...pt(A),
    ...pt(S),
    ...pt(T1),
    ...pt(T2),
    tHat,
    taux,
    mu,
    ...pt(L_vec[0]),
    ...pt(L_vec[1]),
    ...pt(R_vec[0]),
    ...pt(R_vec[1]),
    a_final,
    b_final,
  ];
}

module.exports = { proofToCalldata };
