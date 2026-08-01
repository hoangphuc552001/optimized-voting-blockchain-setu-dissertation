'use strict';
/**
 * Bulletproofs Inner Product Argument (IPA) — Protocol 2 from the paper.
 *
 * Proves: P = <a, G_vec> + <b, H_vec> + <a,b> * Q
 * where Q is a challenge generator injected before recursion starts.
 *
 * Prover: ipaProve(a, b, G_vec, H_vec, Q)  → { L_vec, R_vec, a_final, b_final }
 * Verifier: ipaVerify(G_vec, H_vec, Q, P_init, c, proof) → bool
 *
 * n must be a power of 2.
 */

const {
  Point, Fr,
  frMod, frAdd, frMul, frInv,
  scalarMul, msm, fsHash, innerProduct,
} = require('./curve');

// ── Prover ────────────────────────────────────────────────────────────────────

/**
 * @param {bigint[]}   a       - left  vector (length n, power of 2)
 * @param {bigint[]}   b       - right vector (length n)
 * @param {Point[]}    G_vec   - left  generators (length n)
 * @param {Point[]}    H_vec   - right generators (length n)
 * @param {Point}      Q       - inner-product generator (challenge-based)
 * @returns {{ L_vec: Point[], R_vec: Point[], a_final: bigint, b_final: bigint }}
 */
function ipaProve(a, b, G_vec, H_vec, Q) {
  const L_vec = [];
  const R_vec = [];

  // Working copies
  let aW = a.slice();
  let bW = b.slice();
  let GW = G_vec.slice();
  let HW = H_vec.slice();

  while (aW.length > 1) {
    const n2 = aW.length >> 1;
    const a_lo = aW.slice(0, n2),  a_hi = aW.slice(n2);
    const b_lo = bW.slice(0, n2),  b_hi = bW.slice(n2);
    const G_lo = GW.slice(0, n2),  G_hi = GW.slice(n2);
    const H_lo = HW.slice(0, n2),  H_hi = HW.slice(n2);

    const c_L = innerProduct(a_lo, b_hi);
    const c_R = innerProduct(a_hi, b_lo);

    // L = <a_lo, G_hi> + <b_hi, H_lo> + c_L * Q
    const L = msm(a_lo, G_hi).add(msm(b_hi, H_lo)).add(scalarMul(Q, c_L));
    // R = <a_hi, G_lo> + <b_lo, H_hi> + c_R * Q
    const R = msm(a_hi, G_lo).add(msm(b_lo, H_hi)).add(scalarMul(Q, c_R));

    L_vec.push(L);
    R_vec.push(R);

    const x     = fsHash(L, R);
    const x_inv = frInv(x);

    // Fold generators: G'[i] = x^{-1}*G_lo[i] + x*G_hi[i]
    GW = G_lo.map((g, i) => g.multiply(x_inv).add(G_hi[i].multiply(x)));
    // H'[i] = x*H_lo[i] + x^{-1}*H_hi[i]
    HW = H_lo.map((h, i) => h.multiply(x).add(H_hi[i].multiply(x_inv)));

    // Fold scalars: a' = x*a_lo + x^{-1}*a_hi
    aW = a_lo.map((v, i) => frAdd(frMul(x, v), frMul(x_inv, a_hi[i])));
    // b' = x^{-1}*b_lo + x*b_hi
    bW = b_lo.map((v, i) => frAdd(frMul(x_inv, v), frMul(x, b_hi[i])));
  }

  return { L_vec, R_vec, a_final: aW[0], b_final: bW[0] };
}

// ── Verifier ──────────────────────────────────────────────────────────────────

/**
 * @param {Point[]}  G_vec   - original left  generators (length n)
 * @param {Point[]}  H_vec   - original right generators (length n)
 * @param {Point}    Q       - inner-product generator
 * @param {Point}    P_init  - commitment: <a,G>+<b,H>+<a,b>*Q
 * @param {bigint}   c       - claimed inner product <a,b>
 * @param {object}   proof   - { L_vec, R_vec, a_final, b_final }
 * @returns {boolean}
 */
function ipaVerify(G_vec, H_vec, Q, P_init, c, proof) {
  const { L_vec, R_vec, a_final, b_final } = proof;
  const logN = L_vec.length;

  // Recompute challenges
  const xs = [];
  for (let i = 0; i < logN; i++) xs.push(fsHash(L_vec[i], R_vec[i]));
  const xs_inv = xs.map(x => frInv(x));

  // Fold commitment:  P → x^2*L + P + x^{-2}*R  (per round)
  let P = P_init;
  for (let i = 0; i < logN; i++) {
    const x2    = frMul(xs[i], xs[i]);
    const x_inv2 = frMul(xs_inv[i], xs_inv[i]);
    P = L_vec[i].multiply(x2)
        .add(P)
        .add(R_vec[i].multiply(x_inv2));
  }

  // Fold generators to get G_final, H_final
  // G_final = Σ_i s[i] * G_vec[i]  where s[i] = Π_j (x_j^{b_j}) with b_j ∈ {±1}
  const n = G_vec.length;
  const s = _computeFoldingScalars(xs, xs_inv, n);

  const G_final = msm(s, G_vec);
  // H_final uses inverse scalars
  const s_inv = s.map(v => frInv(v));
  const H_final = msm(s_inv, H_vec);

  // Expected: P == a_final * G_final + b_final * H_final + a_final*b_final * Q
  const c_final = frMul(a_final, b_final);
  const expected = G_final.multiply(a_final)
                           .add(H_final.multiply(b_final))
                           .add(Q.multiply(c_final));

  return P.equals(expected);
}

/**
 * Compute the folding scalars s[i] for 0 ≤ i < n.
 * For leaf index i with binary digits b_{logN-1}...b_0:
 *   s[i] = Π_{j=0}^{logN-1} (xs[logN-1-j]  if bit j of i is 1
 *                              xs_inv[logN-1-j] otherwise)
 * The round-0 challenge xs[0] corresponds to the MSB split (indices ≥ n/2).
 */
function _computeFoldingScalars(xs, xs_inv, n) {
  const logN = xs.length;
  const s    = new Array(n);
  for (let i = 0; i < n; i++) {
    let prod = 1n;
    for (let j = 0; j < logN; j++) {
      prod = frMul(prod, ((i >> j) & 1) ? xs[logN - 1 - j] : xs_inv[logN - 1 - j]);
    }
    s[i] = prod;
  }
  return s;
}

module.exports = { ipaProve, ipaVerify };
