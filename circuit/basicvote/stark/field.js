'use strict';
/**
 * BN254 scalar-field arithmetic + FFT machinery for the STARK.
 *
 * We reuse the BN254 scalar field Fr (same field as the Groth16 / Bulletproofs
 * implementations) so all three protocols are benchmarked on the same field.
 *
 *   p = Fr order, with 2-adicity 28  →  p − 1 = 2^28 · odd
 *   This gives subgroups of every size 2^k for k ≤ 28, which is all FRI needs.
 *
 * Fiat-Shamir uses keccak256 (EVM-native) so the Solidity verifier matches.
 */

const { bn254 } = require('@noble/curves/bn254');
const { keccak_256 } = require('@noble/hashes/sha3');

const p = bn254.CURVE.n; // BN254 scalar field order

// ── Core field ops (all mod p) ────────────────────────────────────────────────
const mod  = (a) => ((a % p) + p) % p;
const add  = (a, b) => mod(a + b);
const sub  = (a, b) => mod(a - b);
const mul  = (a, b) => mod(a * b);
const neg  = (a) => mod(-a);

function pow(base, exp) {
  base = mod(base);
  let r = 1n, e = exp;
  while (e > 0n) { if (e & 1n) r = mul(r, base); base = mul(base, base); e >>= 1n; }
  return r;
}
const inv = (a) => pow(a, p - 2n);          // Fermat
const div = (a, b) => mul(a, inv(b));

// ── Roots of unity ────────────────────────────────────────────────────────────
// A primitive N-th root of unity (N a power of 2, N | 2^28).
// Found by raising a known high-order base to (p−1)/N and checking order.

const TWO_ADICITY = 28n;

function rootOfUnity(N) {
  if ((N & (N - 1)) !== 0) throw new Error(`N=${N} must be a power of 2`);
  const logN = BigInt(Math.log2(N));
  if (logN > TWO_ADICITY) throw new Error(`N=${N} exceeds 2-adicity`);
  // Try small bases until one yields a primitive N-th root.
  for (let baseN = 2n; baseN < 100n; baseN++) {
    const cand = pow(baseN, (p - 1n) / BigInt(N));
    if (cand === 1n) continue;
    if (pow(cand, BigInt(N) / 2n) === 1n) continue; // not primitive
    if (pow(cand, BigInt(N)) === 1n) return cand;
  }
  throw new Error(`no root of unity for N=${N}`);
}

// Domain [offset·ω^0, offset·ω^1, …, offset·ω^{N-1}]
function evalDomain(N, offset = 1n) {
  const w = rootOfUnity(N);
  const dom = new Array(N);
  let acc = mod(offset);
  for (let i = 0; i < N; i++) { dom[i] = acc; acc = mul(acc, w); }
  return dom;
}

// ── FFT / inverse FFT over the size-N subgroup (in place, recursive) ──────────

function _fft(a, w) {
  const n = a.length;
  if (n === 1) return a.slice();
  const even = _fft(a.filter((_, i) => i % 2 === 0), mul(w, w));
  const odd  = _fft(a.filter((_, i) => i % 2 === 1), mul(w, w));
  const out = new Array(n);
  let wi = 1n;
  for (let i = 0; i < n / 2; i++) {
    const t = mul(wi, odd[i]);
    out[i]         = add(even[i], t);
    out[i + n / 2] = sub(even[i], t);
    wi = mul(wi, w);
  }
  return out;
}

// Coefficients → evaluations over <ω_N>
function fft(coeffs) {
  const n = coeffs.length;
  return _fft(coeffs.map(mod), rootOfUnity(n));
}

// Evaluations over <ω_N> → coefficients
function ifft(evals) {
  const n = evals.length;
  const wInv = inv(rootOfUnity(n));
  const res = _fft(evals.map(mod), wInv);
  const nInv = inv(BigInt(n));
  return res.map((v) => mul(v, nInv));
}

// ── Polynomial helpers ────────────────────────────────────────────────────────

// Horner evaluation of coeff polynomial at x
function polyEval(coeffs, x) {
  let r = 0n;
  for (let i = coeffs.length - 1; i >= 0; i--) r = add(mul(r, x), coeffs[i]);
  return r;
}

// Evaluate a coeff polynomial over an arbitrary domain (array of points)
function polyEvalDomain(coeffs, domain) {
  return domain.map((x) => polyEval(coeffs, x));
}

// Interpolate values over the size-N subgroup → coefficients (just ifft)
function interpolateSubgroup(values) {
  return ifft(values);
}

// Evaluate a degree<T trace poly over a coset c·<ω_N> (N = blowup·T).
// Pads the coefficient list up to N before fft, then scales by powers of c.
function evalOverCoset(coeffs, N, offset) {
  const padded = coeffs.slice();
  while (padded.length < N) padded.push(0n);
  // f(c·ω^i): substitute x = c·y. g(y) = f(c·y) has coeffs[i]·c^i.
  let cpow = 1n;
  const scaled = padded.map((v) => { const r = mul(v, cpow); cpow = mul(cpow, offset); return r; });
  return fft(scaled);
}

// ── keccak256 Fiat-Shamir transcript ──────────────────────────────────────────

function toBytes32(n) {
  let tmp = mod(BigInt(n));
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { b[i] = Number(tmp & 0xffn); tmp >>= 8n; }
  return b;
}

function bytesToBig(bytes) {
  let r = 0n;
  for (const x of bytes) r = (r << 8n) | BigInt(x);
  return r;
}

// keccak256 over the concatenation of 32-byte field elements / raw 32-byte values
function hashFields(...elems) {
  const buf = new Uint8Array(elems.length * 32);
  elems.forEach((e, i) => buf.set(toBytes32(e), i * 32));
  return keccak_256(buf);
}

// Fiat-Shamir challenge in Fr from a list of field elements / hashes
function fsChallenge(...elems) {
  const buf = new Uint8Array(elems.length * 32);
  elems.forEach((e, i) => {
    const bytes = e instanceof Uint8Array ? e : toBytes32(e);
    buf.set(bytes, i * 32);
  });
  return mod(bytesToBig(keccak_256(buf)));
}

// ── Fiat-Shamir transcript (must match StarkVerifier.sol exactly) ─────────────
//   absorb(x):     state = keccak256(state ‖ bytes32(x))
//   challenge():   c = keccak256(state); state = c; return c mod p
class Transcript {
  constructor() { this.state = new Uint8Array(32); } // 32 zero bytes

  absorb(value) {
    const bytes = value instanceof Uint8Array ? value : toBytes32(value);
    const buf = new Uint8Array(32 + bytes.length);
    buf.set(this.state, 0);
    buf.set(bytes, 32);
    this.state = keccak_256(buf);
    return this;
  }

  challenge() {
    const c = keccak_256(this.state);
    this.state = c;
    return mod(bytesToBig(c));
  }
}

module.exports = {
  p, mod, add, sub, mul, neg, pow, inv, div,
  rootOfUnity, evalDomain, fft, ifft,
  polyEval, polyEvalDomain, interpolateSubgroup, evalOverCoset,
  toBytes32, bytesToBig, hashFields, fsChallenge, keccak256: keccak_256,
  Transcript,
};
