'use strict';
/**
 * FRI (Fast Reed-Solomon Interactive Oracle Proof of Proximity).
 *
 * Low-degree test: given evaluations of a function over a coset domain
 * D_0 = c·<ω_N>, prove it agrees with a polynomial of degree < N/blowup.
 *
 * Commit phase — repeatedly fold:
 *   f_{i+1}(x²) = (f_i(x) + f_i(−x))/2  +  β_i · (f_i(x) − f_i(−x))/(2x)
 *   each layer halves the domain; Merkle-commit every layer.
 * Query phase — for each random position, open the folding pair at every
 *   layer and check the fold relation; final layer must be constant.
 *
 * Index arithmetic:
 *   D_i[j]      = offset_i · ω_{N_i}^j          (offset_{i+1} = offset_i²)
 *   −D_i[j]     = D_i[j + N_i/2]
 *   (D_i[j])²   = D_{i+1}[j mod N_i/2]
 */

const F = require('./field');
const M = require('./merkle');

const INV2 = F.inv(2n);

/**
 * Commit phase.
 * @param {bigint[]} evals     layer-0 evaluations over D_0 (size N)
 * @param {bigint}   offset    coset offset of D_0
 * @param {Transcript} transcript  shared Fiat-Shamir transcript
 * @returns {{ roots, betas, layers, finalValue, finalSize }}
 */
function friCommit(evals, offset, transcript) {
  const roots = [];
  const betas = [];
  const layers = []; // { evals, tree, offset, size, omega }

  let cur = evals.slice();
  let curOffset = F.mod(offset);
  let size = cur.length;

  // Fold until the domain reaches size 4 (final poly is a constant for our
  // degree bound, so all 4 evaluations are equal — we send one in the clear).
  while (size > 4) {
    const tree = M.buildTree(cur);
    roots.push(tree.root);
    layers.push({ evals: cur, tree, offset: curOffset, size });
    transcript.absorb(tree.root);
    const beta = transcript.challenge();
    betas.push(beta);

    // Fold to next layer (size/2)
    const half = size >> 1;
    const omega = F.rootOfUnity(size);
    const next = new Array(half);
    for (let j = 0; j < half; j++) {
      const x = F.mul(curOffset, F.pow(omega, BigInt(j))); // D_i[j]
      const fa = cur[j];          // f(x)
      const fb = cur[j + half];   // f(−x)
      const even = F.mul(F.add(fa, fb), INV2);
      const odd  = F.mul(F.mul(F.sub(fa, fb), INV2), F.inv(x));
      next[j] = F.add(even, F.mul(beta, odd));
    }
    cur = next;
    curOffset = F.mul(curOffset, curOffset);
    size = half;
  }

  // Final layer (size 4): constant polynomial → all equal. Send one value.
  const finalValue = cur[0];
  transcript.absorb(finalValue);

  return { roots, betas, layers, finalValue, finalSize: size, finalEvals: cur };
}

/**
 * Open one query position across all layers.
 *
 * Position tracking: at layer i with domain size N_i and half = N_i/2,
 *   a_i  = pos_i mod half            ← canonical low index of the folding pair
 *   pair = (a_i, a_i + half)
 *   pos_{i+1} = a_i                  ← the fold lands at index a_i in layer i+1
 *
 * @returns array of per-layer { a, fa, fb, proofA, proofB }
 */
function friOpen(layers, pos) {
  const openings = [];
  let p = pos;
  for (let i = 0; i < layers.length; i++) {
    const { evals, tree, size } = layers[i];
    const half = size >> 1;
    const a = p % half;           // canonical index of the folding pair
    const b = a + half;
    openings.push({
      a,
      fa: evals[a],
      fb: evals[b],
      proofA: M.getProof(tree.layers, a),
      proofB: M.getProof(tree.layers, b),
    });
    p = a; // next layer position = a_i
  }
  return openings;
}

/**
 * Verify one query's FRI openings.
 * @param {Uint8Array[]} roots   per-layer Merkle roots
 * @param {bigint[]}     betas   per-layer fold challenges
 * @param {bigint}       offset0 coset offset of layer 0
 * @param {number}       size0   layer-0 domain size
 * @param {object[]}     openings  from friOpen
 * @param {bigint}       finalValue  the constant final layer value
 * @param {bigint}       expectedLayer0  value CP must take at this position
 *                                       (a, from the constraint check) or null
 * @returns {boolean}
 */
function friVerifyQuery(roots, betas, offset0, size0, openings, finalValue, expectedLayer0, pos0) {
  let offset = F.mod(offset0);
  let size = size0;
  let pos = pos0;

  for (let i = 0; i < openings.length; i++) {
    const { a, fa, fb, proofA, proofB } = openings[i];
    const half = size >> 1;
    const b = a + half;

    // Position consistency: a must equal pos mod half
    if (a !== pos % half) return false;

    // Merkle membership of both pair elements
    if (!M.verifyProof(roots[i], fa, a, proofA)) return false;
    if (!M.verifyProof(roots[i], fb, b, proofB)) return false;

    // Layer-0 binding: opened value at the queried position must equal the
    // constraint-derived CP value (pos0 < half always here, so it is fa)
    if (i === 0 && expectedLayer0 != null && fa !== F.mod(expectedLayer0)) return false;

    // Fold relation → value at index a in layer i+1
    const omega = F.rootOfUnity(size);
    const x = F.mul(offset, F.pow(omega, BigInt(a)));
    const even = F.mul(F.add(fa, fb), INV2);
    const odd  = F.mul(F.mul(F.sub(fa, fb), INV2), F.inv(x));
    const folded = F.add(even, F.mul(betas[i], odd));

    const nextPos = a; // fold lands at index a in the next layer

    if (i + 1 < openings.length) {
      // The folded value sits at index nextPos in layer i+1. Depending on
      // whether nextPos is in the lower or upper half of that layer's pair,
      // it equals the next opening's fa or fb.
      const nextHalf = half >> 1;
      const nextLow  = nextPos % nextHalf;
      if (openings[i + 1].a !== nextLow) return false;
      const expected = (nextPos < nextHalf) ? openings[i + 1].fa : openings[i + 1].fb;
      if (folded !== expected) return false;
    } else {
      // Last fold must hit the constant final value
      if (folded !== F.mod(finalValue)) return false;
    }

    offset = F.mul(offset, offset);
    size = half;
    pos = nextPos;
  }
  return true;
}

module.exports = { friCommit, friOpen, friVerifyQuery, INV2 };
