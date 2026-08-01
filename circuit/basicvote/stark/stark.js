'use strict';
/**
 * A complete (small) zk-STARK over the BN254 scalar field.
 *
 * Statement (FibonacciSq AIR, à la StarkWare's STARK-101):
 *   The prover knows a secret `s` such that the sequence
 *       a[0] = 1,  a[1] = s,  a[i+2] = a[i+1]² + a[i]²   (mod p)
 *   reaches a public output a[T-1] = `output`.
 *
 *   This is a genuine proof of knowledge of a witness (the secret `s`) that
 *   drives a computation to a public result — structurally analogous to the
 *   Groth16 circuit proving knowledge of a voter secret behind a nullifier.
 *   For the RQ4 benchmark, what matters is that it is a real STARK: an AIR
 *   over an execution trace, low-degree-tested by FRI with Merkle commitments,
 *   verified on-chain. The exact relation is representative, not load-bearing.
 *
 * Protocol:
 *   1. Build trace, interpolate trace polynomial f over the trace subgroup.
 *   2. Low-degree-extend f over a coset LDE domain (blowup ×8); Merkle-commit.
 *   3. Derive constraint-combination challenges α0,α1,α2 (Fiat-Shamir).
 *   4. Form the composition polynomial CP = α0·q0 + α1·q1 + α2·q2 pointwise
 *      over the LDE domain (q0,q1 boundary, q2 transition quotient).
 *   5. FRI-prove CP is low degree.
 *   6. Open the trace at each FRI query position (and its g·, g²· shifts) so the
 *      verifier can recompute CP at that point and bind it to FRI layer 0.
 */

const F = require('./field');
const M = require('./merkle');
const FRI = require('./fri');

// ── Parameters ────────────────────────────────────────────────────────────────
const PARAMS = {
  T: 64,         // trace length (power of 2)
  blowup: 8,     // LDE blowup factor
  offset: 5n,    // LDE coset offset (must satisfy offset^N ≠ 1)
  numQueries: 16,
};

// ── Trace generation ──────────────────────────────────────────────────────────
function buildTrace(secret, T) {
  const a = new Array(T);
  a[0] = 1n;
  a[1] = F.mod(secret);
  for (let i = 2; i < T; i++) {
    a[i] = F.add(F.mul(a[i - 1], a[i - 1]), F.mul(a[i - 2], a[i - 2]));
  }
  return a;
}

// ── Prover ────────────────────────────────────────────────────────────────────
function prove(secret, params = PARAMS) {
  const { T, blowup, offset, numQueries } = params;
  const N = blowup * T;

  // Sanity: coset offset not in the LDE subgroup
  if (F.pow(offset, BigInt(N)) === 1n) throw new Error('bad coset offset');

  // 1. Trace + public output
  const trace = buildTrace(secret, T);
  const output = trace[T - 1];

  // 2. Trace polynomial f (coeffs), then LDE over coset
  const fCoeffs = F.interpolateSubgroup(trace);     // degree < T
  const fLDE    = F.evalOverCoset(fCoeffs, N, offset);

  // Merkle-commit the trace LDE
  const traceTree = M.buildTree(fLDE);

  // 3. Fiat-Shamir transcript
  const tr = new F.Transcript();
  tr.absorb(output);
  tr.absorb(traceTree.root);
  const alpha0 = tr.challenge();
  const alpha1 = tr.challenge();
  const alpha2 = tr.challenge();

  // 4. Composition polynomial over the LDE domain
  const g       = F.rootOfUnity(T);                 // trace-domain generator
  const gLast   = F.pow(g, BigInt(T - 1));          // g^{T-1}
  const gLast2  = F.pow(g, BigInt(T - 2));          // g^{T-2}
  const domain  = F.evalDomain(N, offset);          // LDE points
  const b       = blowup;

  const CP = new Array(N);
  for (let j = 0; j < N; j++) {
    const x    = domain[j];
    const fx   = fLDE[j];
    const fgx  = fLDE[(j + b) % N];                  // f(g·x)
    const fg2x = fLDE[(j + 2 * b) % N];              // f(g²·x)

    // Boundary quotients
    const q0 = F.mul(F.sub(fx, 1n),      F.inv(F.sub(x, 1n)));        // a0 = 1
    const q1 = F.mul(F.sub(fx, output),  F.inv(F.sub(x, gLast)));     // a_{T-1}=output

    // Transition quotient: t(x) vanishes on g^0..g^{T-3}
    const t  = F.sub(F.sub(fg2x, F.mul(fgx, fgx)), F.mul(fx, fx));
    const numer = F.mul(t, F.mul(F.sub(x, gLast2), F.sub(x, gLast)));
    const denom = F.sub(F.pow(x, BigInt(T)), 1n);                     // x^T − 1
    const q2 = F.mul(numer, F.inv(denom));

    CP[j] = F.add(F.add(F.mul(alpha0, q0), F.mul(alpha1, q1)), F.mul(alpha2, q2));
  }

  // 5. FRI on CP (shares the transcript)
  const fri = FRI.friCommit(CP, offset, tr);

  // 6. Query positions, then open trace + FRI at each
  const positions = [];
  for (let i = 0; i < numQueries; i++) {
    positions.push(Number(tr.challenge() % BigInt(N / 2)));
  }

  const queries = positions.map((pos) => {
    const idx0 = pos;
    const idxB = (pos + b) % N;
    const idx2B = (pos + 2 * b) % N;
    return {
      pos,
      trace: {
        f0:  fLDE[idx0],  proof0:  M.getProof(traceTree.layers, idx0),
        fB:  fLDE[idxB],  proofB:  M.getProof(traceTree.layers, idxB),
        f2B: fLDE[idx2B], proof2B: M.getProof(traceTree.layers, idx2B),
        idxB, idx2B,
      },
      fri: FRI.friOpen(fri.layers, pos),
    };
  });

  return {
    output,
    traceRoot: traceTree.root,
    friRoots: fri.roots,
    friFinalValue: fri.finalValue,
    queries,
    params,
  };
}

// ── Verifier ──────────────────────────────────────────────────────────────────
function verify(proof) {
  const { output, traceRoot, friRoots, friFinalValue, queries, params } = proof;
  const { T, blowup, offset, numQueries } = params;
  const N = blowup * T;
  const b = blowup;

  // Recompute Fiat-Shamir transcript
  const tr = new F.Transcript();
  tr.absorb(output);
  tr.absorb(traceRoot);
  const alpha0 = tr.challenge();
  const alpha1 = tr.challenge();
  const alpha2 = tr.challenge();

  // Replay FRI transcript: absorb each fri root, squeeze β; then finalValue
  const betas = [];
  for (let i = 0; i < friRoots.length; i++) { tr.absorb(friRoots[i]); betas.push(tr.challenge()); }
  tr.absorb(friFinalValue);

  // Query positions
  const positions = [];
  for (let i = 0; i < numQueries; i++) positions.push(Number(tr.challenge() % BigInt(N / 2)));

  // Constants
  const g      = F.rootOfUnity(T);
  const gLast  = F.pow(g, BigInt(T - 1));
  const gLast2 = F.pow(g, BigInt(T - 2));
  const omegaN = F.rootOfUnity(N);

  for (let k = 0; k < numQueries; k++) {
    const pos = positions[k];
    const q   = queries[k];
    if (q.pos !== pos) return false;

    // Verify trace Merkle openings
    const idxB  = (pos + b) % N;
    const idx2B = (pos + 2 * b) % N;
    if (!M.verifyProof(traceRoot, q.trace.f0,  pos,   q.trace.proof0))  return false;
    if (!M.verifyProof(traceRoot, q.trace.fB,  idxB,  q.trace.proofB))  return false;
    if (!M.verifyProof(traceRoot, q.trace.f2B, idx2B, q.trace.proof2B)) return false;

    // Recompute CP at x = LDE[pos]
    const x    = F.mul(offset, F.pow(omegaN, BigInt(pos)));
    const fx   = q.trace.f0;
    const fgx  = q.trace.fB;
    const fg2x = q.trace.f2B;

    const q0 = F.mul(F.sub(fx, 1n),     F.inv(F.sub(x, 1n)));
    const q1 = F.mul(F.sub(fx, output), F.inv(F.sub(x, gLast)));
    const t  = F.sub(F.sub(fg2x, F.mul(fgx, fgx)), F.mul(fx, fx));
    const numer = F.mul(t, F.mul(F.sub(x, gLast2), F.sub(x, gLast)));
    const denom = F.sub(F.pow(x, BigInt(T)), 1n);
    const q2 = F.mul(numer, F.inv(denom));
    const cp = F.add(F.add(F.mul(alpha0, q0), F.mul(alpha1, q1)), F.mul(alpha2, q2));

    // FRI verify this query, binding layer-0 value to the recomputed CP
    const ok = FRI.friVerifyQuery(friRoots, betas, offset, N, q.fri, friFinalValue, cp, pos);
    if (!ok) return false;
  }
  return true;
}

module.exports = { PARAMS, buildTrace, prove, verify };
