'use strict';
/**
 * Binary Merkle tree over keccak256, byte-compatible with the Solidity verifier.
 *
 * Conventions (must match StarkVerifier.sol):
 *   leaf_hash(v) = keccak256(bytes32(v))            // v is a field element
 *   node(l, r)   = keccak256(l ‖ r)                 // l, r are 32-byte hashes
 *   index bit 0  = left child, bit 1 = right child  // LSB first, leaf→root
 *
 * The number of leaves must be a power of 2.
 */

const { keccak_256 } = require('@noble/hashes/sha3');
const { toBytes32 } = require('./field');

function concatHash(a, b) {
  const buf = new Uint8Array(64);
  buf.set(a, 0);
  buf.set(b, 32);
  return keccak_256(buf);
}

function leafHash(value) {
  return keccak_256(toBytes32(value));
}

function toHex(bytes) {
  return '0x' + Array.from(bytes).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a Merkle tree from an array of field-element leaves.
 * @returns { root: Uint8Array, layers: Uint8Array[][] }  layers[0] = leaf hashes
 */
function buildTree(values) {
  const n = values.length;
  if ((n & (n - 1)) !== 0) throw new Error('leaf count must be a power of 2');

  let layer = values.map(leafHash);
  const layers = [layer];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(concatHash(layer[i], layer[i + 1]));
    }
    layers.push(next);
    layer = next;
  }
  return { root: layers[layers.length - 1][0], layers };
}

/**
 * Authentication path (sibling hashes) for a leaf index, leaf→root order.
 * @returns Uint8Array[]  one sibling hash per level
 */
function getProof(layers, index) {
  const proof = [];
  let idx = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const sibling = idx ^ 1; // flip LSB
    proof.push(layers[level][sibling]);
    idx >>= 1;
  }
  return proof;
}

/**
 * Recompute the root from a leaf value + its authentication path.
 * Mirrors the on-chain verification exactly.
 */
function computeRoot(value, index, proof) {
  let h = leafHash(value);
  let idx = index;
  for (const sibling of proof) {
    h = (idx & 1) === 0 ? concatHash(h, sibling) : concatHash(sibling, h);
    idx >>= 1;
  }
  return h;
}

function verifyProof(root, value, index, proof) {
  return toHex(computeRoot(value, index, proof)) === toHex(root);
}

module.exports = {
  concatHash, leafHash, toHex, buildTree, getProof, computeRoot, verifyProof,
};
