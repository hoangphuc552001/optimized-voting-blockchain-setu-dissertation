/**
 * Merkle Tree Utilities for ZK Voting
 * 
 * This module provides utilities for:
 * - Building Merkle trees from voter commitments
 * - Generating Merkle proofs for voters
 * - Verifying Merkle proofs
 * 
 * Uses Poseidon hash for ZK-friendly operations
 */

import { Poseidon } from 'circomlibjs';
import { MerkleTree } from 'merkletreejs';
import SHA3 from 'keccakjs';

/**
 * Build a Merkle tree from an array of voter commitments
 * @param commitments Array of voter leaf values
 * @param depth Tree depth (default 20)
 * @returns MerkleTree instance
 */
export function buildVoterMerkleTree(
    commitments: string[],
    depth: number = 20
): MerkleTree {
    // Use Poseidon hash for ZK-friendly hashing
    const hash = (left: Buffer, right: Buffer): Buffer => {
        const poseidon = new Poseidon();
        const leftBigInt = BigInt('0x' + left.toString('hex'));
        const rightBigInt = BigInt('0x' + right.toString('hex'));
        const [hash1, hash2] = poseidon([leftBigInt, rightBigInt]);
        return Buffer.from(hash1.toString(16).padStart(64, '0'), 'hex');
    };
    
    // Create Merkle tree with Poseidon hashing
    const tree = new MerkleTree(commitments.map(c => Buffer.from(c.slice(2), 'hex')), hash, {
        depth,
        complete: true,
    });
    
    return tree;
}

/**
 * Generate a Merkle proof for a voter at a given index
 * @param tree Merkle tree instance
 * @param index Voter's position in the tree
 * @returns Array of proof elements
 */
export function getMerkleProof(
    tree: MerkleTree,
    index: number
): string[] {
    const proof = tree.getProof(index);
    return proof.map(node => {
        if (Buffer.isBuffer(node.data)) {
            return '0x' + node.data.toString('hex');
        }
        return '0x' + Buffer.from(node.data).toString('hex');
    });
}

/**
 * Calculate Merkle root from commitments
 * @param commitments Array of commitments
 * @returns Merkle root as hex string
 */
export function calculateMerkleRoot(commitments: string[]): string {
    const tree = buildVoterMerkleTree(commitments);
    return '0x' + tree.getRoot().toString('hex');
}

/**
 * Verify a Merkle proof
 * @param leaf Voter's leaf commitment
 * @param proof Proof elements
 * @param root Merkle root
 * @param depth Tree depth
 * @returns true if proof is valid
 */
export function verifyMerkleProof(
    leaf: string,
    proof: string[],
    root: string,
    depth: number = 20
): boolean {
    const poseidon = new Poseidon();
    let current = BigInt(leaf);
    
    for (let i = 0; i < proof.length; i++) {
        const proofElement = BigInt(proof[i]);
        // Alternate between left and right based on path
        if (i % 2 === 0) {
            [current] = poseidon([current, proofElement]);
        } else {
            [current] = poseidon([proofElement, current]);
        }
    }
    
    return '0x' + current.toString(16).padStart(64, '0').slice(-64) === root;
}

/**
 * Generate random salt for vote commitment
 * @returns Random 32-byte salt
 */
export function generateSalt(): string {
    const bytes = crypto.randomBytes(32);
    return '0x' + bytes.toString('hex');
}

/**
 * Generate voter secret (pseudo-random for demo)
 * In production, this should be a user-generated secret
 * @param voterAddress Voter's Ethereum address
 * @param electionId Election identifier
 * @returns Voter's secret commitment
 */
export function generateVoterSecret(
    voterAddress: string,
    electionId: string
): string {
    // In production, this should be a user-provided secret
    // For demo purposes, we derive from address + election
    const keccak = new SHA3(256);
    keccak.update(voterAddress.slice(2));
    keccak.update(electionId.slice(2));
    keccak.update(crypto.randomBytes(16));
    return '0x' + keccak.digest('hex');
}

/**
 * Calculate vote commitment using Poseidon
 * @param voteOption Candidate ID
 * @param secret Voter's secret
 * @param nullifier Unique nullifier
 * @param salt Random salt
 * @returns Vote commitment hash
 */
export function calculateVoteCommitment(
    voteOption: number,
    secret: string,
    nullifier: string,
    salt: string
): string {
    const poseidon = new Poseidon();
    const inputs = [
        BigInt(voteOption),
        BigInt(secret),
        BigInt(nullifier),
        BigInt(salt)
    ];
    const [commitment] = poseidon(inputs);
    return '0x' + commitment.toString(16).padStart(64, '0');
}

/**
 * Calculate nullifier using Poseidon
 * @param secret Voter's secret
 * @param electionId Election identifier
 * @returns Nullifier hash
 */
export function calculateNullifier(
    secret: string,
    electionId: string
): string {
    const poseidon = new Poseidon();
    const [nullifier] = poseidon([BigInt(secret), BigInt(electionId)]);
    return '0x' + nullifier.toString(16).padStart(64, '0');
}

/**
 * Create voter leaf for Merkle tree
 * @param secret Voter's secret
 * @param nullifier Voter's nullifier
 * @returns Leaf value
 */
export function createVoterLeaf(
    secret: string,
    nullifier: string
): string {
    const poseidon = new Poseidon();
    const [leaf] = poseidon([BigInt(secret), BigInt(nullifier)]);
    return '0x' + leaf.toString(16).padStart(64, '0');
}

/**
 * Get path indices for Merkle proof
 * @param index Voter's position in tree
 * @param depth Tree depth
 * @returns Array of 0/1 path indices
 */
export function getPathIndices(index: number, depth: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < depth; i++) {
        indices.push((index >> i) & 1);
    }
    return indices;
}

/**
 * Format Merkle proof for circuit input
 * @param proof Raw proof elements
 * @param depth Tree depth
 * @returns Formatted proof array
 */
export function formatProofForCircuit(
    proof: string[],
    depth: number
): string[] {
    // Pad or truncate proof to match circuit depth
    const formatted = proof.slice(0, depth);
    while (formatted.length < depth) {
        formatted.push('0x0000000000000000000000000000000000000000000000000000000000000000');
    }
    return formatted;
}
