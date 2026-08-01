'use strict';
/**
 * Bulletproofs Range Proof — Protocol 3 from the paper.
 *
 * Proves v ∈ [0, 2^n − 1] w.r.t. Pedersen commitment V = v*G + γ*H.
 * No trusted setup. Proof is ZK with O(log n) IPA rounds.
 */

const {
  Point, G, H, Fr,
  frMod, frAdd, frSub, frMul, frInv,
  bytesToBigInt, hashToPoint, fsHash,
  scalarMul, msm, getVecGens, innerProduct,
} = require('./curve');
const { ipaProve, ipaVerify } = require('./ipa');
const { randomBytes } = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomScalar() {
  // Sample 64 bytes so reduction bias is negligible
  return frMod(bytesToBigInt(randomBytes(64)));
}

// Power vector [1, y, y², …, y^{n-1}]
function powVec(y, n) {
  const v = [1n];
  for (let i = 1; i < n; i++) v.push(frMul(v[i - 1], y));
  return v;
}

// δ(y,z) = (z−z²)·⟨1^n,y^n⟩ − z³·⟨1^n,2^n⟩
function delta(y, z, n) {
  const sumYn  = powVec(y, n).reduce(frAdd, 0n);
  const sumTwo = powVec(2n, n).reduce(frAdd, 0n);
  const z2 = frMul(z, z);
  return frSub(frMul(frSub(z, z2), sumYn), frMul(frMul(z2, z), sumTwo));
}

// ── Prover ────────────────────────────────────────────────────────────────────

/**
 * @param {bigint} v      value to prove (0 ≤ v < 2^n)
 * @param {bigint|null} gamma  blinding factor (random if null)
 * @param {number} n      bit-width (power of 2)
 * @returns proof object  { V, A, S, T1, T2, tHat, taux, mu, ipaProof }
 */
function prove(v, gamma, n) {
  if (gamma == null) gamma = randomScalar();
  if (v < 0n || v >= (1n << BigInt(n)))
    throw new Error(`Value ${v} out of range [0, 2^${n})`);

  const G_vec = getVecGens('BP_G', n);
  const H_vec = getVecGens('BP_H', n);

  // ── Step 1: bit decomposition ─────────────────────────────────────────────
  const aL = [], aR = [];
  for (let i = 0; i < n; i++) {
    const b = (v >> BigInt(i)) & 1n;
    aL.push(b);
    aR.push(frSub(b, 1n));  // aR[i] = aL[i] - 1
  }

  // ── Step 2: blinded bit commitments ──────────────────────────────────────
  const alpha = randomScalar(), rho = randomScalar();
  // A = ⟨aL, G_vec⟩ + ⟨aR, H_vec⟩ + α·H
  const A = msm(aL, G_vec).add(msm(aR, H_vec)).add(H.multiply(alpha));
  const sL = Array.from({ length: n }, randomScalar);
  const sR = Array.from({ length: n }, randomScalar);
  // S = ⟨sL, G_vec⟩ + ⟨sR, H_vec⟩ + ρ·H
  const S = msm(sL, G_vec).add(msm(sR, H_vec)).add(H.multiply(rho));
  // Pedersen commitment V = v·G + γ·H
  const V = scalarMul(G, v).add(H.multiply(gamma));

  // ── Step 3: challenges y, z ───────────────────────────────────────────────
  const y = fsHash(V, A, S);
  const z = fsHash(y);
  const z2 = frMul(z, z);
  const yn   = powVec(y, n);
  const twon = powVec(2n, n);

  // ── Step 4: polynomial t(x) = ⟨l(x), r(x)⟩ ──────────────────────────────
  // l(x)[i] = aL[i] − z       + sL[i]·x
  // r(x)[i] = y^i·(aR[i]+z+sR[i]·x) + z²·2^i
  // t1 = ⟨aL−z, y^n∘sR⟩ + ⟨sL, y^n∘(aR+z)+z²·2^n⟩
  const t1 = frAdd(
    innerProduct(aL.map(a => frSub(a, z)), yn.map((yi, i) => frMul(yi, sR[i]))),
    innerProduct(sL, yn.map((yi, i) => frAdd(frMul(yi, frAdd(aR[i], z)), frMul(z2, twon[i]))))
  );
  const t2 = innerProduct(sL, yn.map((yi, i) => frMul(yi, sR[i])));

  const tau1 = randomScalar(), tau2 = randomScalar();
  const T1 = scalarMul(G, t1).add(H.multiply(tau1));
  const T2 = scalarMul(G, t2).add(H.multiply(tau2));

  // ── Step 5: challenge x ───────────────────────────────────────────────────
  const x  = fsHash(y, z, T1, T2);
  const x2 = frMul(x, x);

  // ── Step 6: evaluate l(x), r(x), t̂ ──────────────────────────────────────
  const lVec = aL.map((ai, i) => frAdd(frSub(ai, z), frMul(sL[i], x)));
  const rVec = yn.map((yi, i) =>
    frAdd(frMul(yi, frAdd(frAdd(aR[i], z), frMul(sR[i], x))), frMul(z2, twon[i]))
  );
  const tHat = innerProduct(lVec, rVec);

  // ── Step 7: blinding response scalars ────────────────────────────────────
  const taux = frAdd(frAdd(frMul(tau2, x2), frMul(tau1, x)), frMul(z2, gamma));
  const mu   = frAdd(alpha, frMul(rho, x));

  // ── Step 8: IPA with modified generators H'[i] = y^{-i}·H_vec[i] ────────
  const y_inv  = frInv(y);
  const yn_inv = powVec(y_inv, n);
  const H_mod  = H_vec.map((h, i) => scalarMul(h, yn_inv[i]));

  // Q = challenge generator for the inner product (Fiat-Shamir binding)
  const Q = scalarMul(hashToPoint('BP_IPA_Q'), fsHash(x, tHat));

  // P_IPA = A + x·S − z·ΣG_vec + Σ(z + z²·2^i·y^{−i})·H_vec − μ·H
  // Derivation: equals ⟨lVec, G_vec⟩ + ⟨rVec, H_mod⟩ (blinding-free)
  const sumG  = G_vec.reduce((a, g) => a.add(g), Point.ZERO);
  const sumZH = H_vec.reduce((a, h, i) =>
    a.add(scalarMul(h, frAdd(z, frMul(z2, frMul(twon[i], yn_inv[i]))))), Point.ZERO);
  const P_IPA = A.add(S.multiply(x))
                 .subtract(sumG.multiply(z))
                 .add(sumZH)
                 .subtract(H.multiply(mu));
  const P_init = P_IPA.add(scalarMul(Q, tHat));

  const ipaProof = ipaProve(lVec, rVec, G_vec, H_mod, Q);
  return { V, A, S, T1, T2, tHat, taux, mu, ipaProof, n };
}

// ── Verifier ──────────────────────────────────────────────────────────────────

/**
 * @param {Point}  V     Pedersen commitment to the secret value
 * @param {object} proof output of prove()
 * @param {number} n     bit-width
 * @returns {boolean}
 */
function verify(V, proof, n) {
  const { A, S, T1, T2, tHat, taux, mu, ipaProof } = proof;
  const G_vec = getVecGens('BP_G', n);
  const H_vec = getVecGens('BP_H', n);

  // Recompute Fiat-Shamir challenges
  const y  = fsHash(V, A, S);
  const z  = fsHash(y);
  const x  = fsHash(y, z, T1, T2);
  const x2 = frMul(x, x);
  const z2 = frMul(z, z);
  const twon   = powVec(2n, n);
  const y_inv  = frInv(y);
  const yn_inv = powVec(y_inv, n);

  // ── Check 1: t̂·G + τₓ·H == z²·V + δ·G + x·T1 + x²·T2 ──────────────────
  const lhs = scalarMul(G, tHat).add(H.multiply(taux));
  const rhs = scalarMul(V, z2)
              .add(scalarMul(G, delta(y, z, n)))
              .add(T1.multiply(x))
              .add(T2.multiply(x2));
  if (!lhs.equals(rhs)) return false;

  // ── Check 2: IPA ─────────────────────────────────────────────────────────
  const H_mod = H_vec.map((h, i) => scalarMul(h, yn_inv[i]));
  const Q     = scalarMul(hashToPoint('BP_IPA_Q'), fsHash(x, tHat));

  const sumG  = G_vec.reduce((a, g) => a.add(g), Point.ZERO);
  const sumZH = H_vec.reduce((a, h, i) =>
    a.add(scalarMul(h, frAdd(z, frMul(z2, frMul(twon[i], yn_inv[i]))))), Point.ZERO);
  const P_IPA = A.add(S.multiply(x))
                 .subtract(sumG.multiply(z))
                 .add(sumZH)
                 .subtract(H.multiply(mu));
  const P_init = P_IPA.add(scalarMul(Q, tHat));

  return ipaVerify(G_vec, H_mod, Q, P_init, tHat, ipaProof);
}

module.exports = { prove, verify };
