'use strict';
/**
 * BN254 curve utilities for Bulletproofs.
 * Uses @noble/curves/bn254 (already present via snarkjs deps).
 *
 * Notation throughout:
 *   Fr  = scalar field order (= CURVE.n)
 *   Fp  = base  field order  (= CURVE.p)
 *   G   = standard generator (1, 2)
 *   H   = nothing-up-my-sleeve second generator (hash-to-curve of fixed seed)
 */

const { bn254 } = require('@noble/curves/bn254');
const { keccak_256 } = require('@noble/hashes/sha3');

const Point = bn254.ProjectivePoint;
const Fr = bn254.CURVE.n;   // scalar field order
const Fp = bn254.CURVE.p;   // base  field order
const G  = Point.BASE;       // (1, 2)

// ── Field arithmetic (all mod Fr) ────────────────────────────────────────────

function frMod(a)     { return ((a % Fr) + Fr) % Fr; }
function frAdd(a, b)  { return frMod(a + b); }
function frSub(a, b)  { return frMod(a - b); }
function frMul(a, b)  { return frMod(a * b); }
function frNeg(a)     { return frMod(-a); }
function frPow(a, e)  {
  let r = 1n, b = frMod(a);
  e = ((e % (Fr - 1n)) + (Fr - 1n)) % (Fr - 1n); // Fermat
  while (e > 0n) { if (e & 1n) r = frMul(r, b); e >>= 1n; b = frMul(b, b); }
  return r;
}
function frInv(a)     { return frPow(a, Fr - 2n); }   // Fermat's little theorem

// ── Serialisation ─────────────────────────────────────────────────────────────

function bigIntToBytes32(n) {
  // Non-negative BigInt → 32-byte big-endian Uint8Array
  let tmp = BigInt(n);
  if (tmp < 0n) tmp += (1n << 256n);
  tmp %= (1n << 256n);
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { b[i] = Number(tmp & 0xffn); tmp >>= 8n; }
  return b;
}

function bytesToBigInt(bytes) {
  let r = 0n;
  for (const byte of bytes) r = (r << 8n) | BigInt(byte);
  return r;
}

function pointToBytes(P) {
  const { x, y } = P.toAffine();
  const out = new Uint8Array(64);
  out.set(bigIntToBytes32(x),  0);
  out.set(bigIntToBytes32(y), 32);
  return out;
}

// Encode a point as two 32-byte hex strings for Solidity calldata
function pointToHex(P) {
  const { x, y } = P.toAffine();
  return {
    x: '0x' + x.toString(16).padStart(64, '0'),
    y: '0x' + y.toString(16).padStart(64, '0'),
  };
}

// ── Hash-to-curve (try-and-increment over BN254 y² = x³ + 3) ─────────────────
// p ≡ 3 (mod 4) so sqrt via (y²)^{(p+1)/4}

function _modpowFp(a, e) {
  let r = 1n, b = ((a % Fp) + Fp) % Fp;
  while (e > 0n) { if (e & 1n) r = r * b % Fp; e >>= 1n; b = b * b % Fp; }
  return r;
}

function hashToPoint(seed) {
  const seedBytes = new TextEncoder().encode(seed);
  for (let ctr = 0n; ; ctr++) {
    const cBuf = bigIntToBytes32(ctr);
    const inp = new Uint8Array(seedBytes.length + 32);
    inp.set(seedBytes);
    inp.set(cBuf, seedBytes.length);
    let x = bytesToBigInt(keccak_256(inp)) % Fp;
    const y2 = (x * x % Fp * x % Fp + 3n) % Fp;
    const y  = _modpowFp(y2, (Fp + 1n) / 4n);
    if (y * y % Fp === y2) {
      try { return Point.fromAffine({ x, y }); } catch (_) {}
    }
  }
}

// ── Fiat-Shamir oracle ────────────────────────────────────────────────────────

function fsHash(...elements) {
  const chunks = elements.map(e => {
    if (typeof e === 'bigint') return bigIntToBytes32(frMod(e));
    if (e && typeof e.toAffine === 'function') return pointToBytes(e);
    if (e instanceof Uint8Array) return e;
    throw new Error('fsHash: unsupported element type');
  });
  const total  = chunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { combined.set(c, off); off += c.length; }
  return frMod(bytesToBigInt(keccak_256(combined)));
}

// ── Safe scalar multiplication (handles s=0 which noble-curves rejects) ──────

function scalarMul(P, s) {
  const sn = frMod(s);
  return sn === 0n ? Point.ZERO : P.multiply(sn);
}

// ── Multi-scalar multiplication ───────────────────────────────────────────────

function msm(scalars, points) {
  let acc = Point.ZERO;
  for (let i = 0; i < scalars.length; i++) {
    const s = frMod(scalars[i]);
    if (s !== 0n) acc = acc.add(points[i].multiply(s));
  }
  return acc;
}

// ── Cached vector generators ──────────────────────────────────────────────────
// Generated deterministically so the Solidity verifier can replicate them.
// In a real deployment these would be generated once and hard-coded.

const _genCache = new Map();

function getVecGens(prefix, n) {
  const key = `${prefix}_${n}`;
  if (_genCache.has(key)) return _genCache.get(key);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(hashToPoint(`${prefix}_${i}`));
  _genCache.set(key, pts);
  return pts;
}

// ── Nothing-up-my-sleeve second generator ─────────────────────────────────────
// H = hash_to_curve("BulletproofsBN254_H")
const H = hashToPoint('BulletproofsBN254_H');

// ── Inner-product (scalar) ────────────────────────────────────────────────────
function innerProduct(a, b) {
  let s = 0n;
  for (let i = 0; i < a.length; i++) s = frAdd(s, frMul(a[i], b[i]));
  return s;
}

module.exports = {
  Point, G, H, Fr, Fp,
  frMod, frAdd, frSub, frMul, frNeg, frPow, frInv,
  bigIntToBytes32, bytesToBigInt, pointToBytes, pointToHex,
  hashToPoint, fsHash, scalarMul, msm, getVecGens, innerProduct,
};
