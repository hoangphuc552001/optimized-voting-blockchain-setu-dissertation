const { buildPoseidon } = require("circomlibjs");

const BATCH_SIZE = 16;
const NUM_CANDIDATES = 5;

/**
 * TwoLayerBatcher — Operator batcher for two-layer proof architecture
 *
 * Key difference from original Batcher:
 * - Receives pre-verified vote proofs (proof + public signals)
 * - DOES NOT receive voter secrets
 * - DOES NOT need voter Merkle path data
 * - Only assembles state transitions from (candidate, vote) pairs
 */
class TwoLayerBatcher {
    constructor(stateTree, batchSize = BATCH_SIZE) {
        this.stateTree = stateTree;
        this.batchSize = batchSize;
        this.poseidon = null;
        this.F = null;
    }

    async init() {
        this.poseidon = await buildPoseidon();
        this.F = this.poseidon.F;
        console.log("[TWO-LAYER BATCHER] Initialized with batch size:", this.batchSize);
    }

    /**
     * Assemble a batch from verified individual vote proofs.
     * 
     * @param {Array} verifiedVotes - Array of verified votes, each containing:
     *   { proof, nullifierHash, candidate, vote }
     *   NOTE: No voterSecret, no voter Merkle paths!
     * @param {BigInt} voterMerkleRoot - The voter Merkle root (for public signal)
     * @returns {Object} Batch input for the BatchStateUpdate circuit
     */
    assembleBatch(verifiedVotes, voterMerkleRoot) {
        console.log(`[BATCH] Assembling two-layer batch with ${verifiedVotes.length} verified vote(s)...`);

        const realVotes = verifiedVotes.slice(0, this.batchSize);
        const paddedVotes = [...realVotes];

        // Pad with noOp entries
        while (paddedVotes.length < this.batchSize) {
            paddedVotes.push({
                nullifierHash: "0",
                candidate: 0,
                vote: 0,
                isNoOp: true
            });
        }

        const preStateRoot = this.stateTree.getRoot();
        console.log(`[BATCH] preStateRoot: ${preStateRoot.toString().substring(0, 20)}...`);

        // Only state transition data — NO voter secrets or Merkle paths
        const candidates = [];
        const votes = [];
        const nullifierHashes = [];
        const isNoOps = [];
        const stateLeafIndices = [];
        const stateOldValues = [];
        const stateNewValues = [];
        const statePathElements = [];

        for (let i = 0; i < this.batchSize; i++) {
            const v = paddedVotes[i];
            const isNoOp = v.isNoOp || false;
            isNoOps.push(isNoOp ? "1" : "0");

            candidates.push((v.candidate || 0).toString());
            votes.push((v.vote || 0).toString());
            nullifierHashes.push((v.nullifierHash || "0").toString());

            if (isNoOp) {
                const candidateIdx = 0;
                const oldVal = this.stateTree.getLeaf(candidateIdx);
                const proof = this.stateTree.getProof(candidateIdx);

                stateLeafIndices.push(candidateIdx.toString());
                stateOldValues.push(oldVal.toString());
                stateNewValues.push(oldVal.toString());
                statePathElements.push(proof.pathElements.map(e => e.toString()));
            } else {
                const candidateIdx = v.candidate;
                const oldVal = this.stateTree.getLeaf(candidateIdx);
                const proof = this.stateTree.getProof(candidateIdx);

                stateLeafIndices.push(candidateIdx.toString());
                stateOldValues.push(oldVal.toString());

                if (v.vote === 1) {
                    const newVal = oldVal + 1n;
                    stateNewValues.push(newVal.toString());
                    this.stateTree.updateLeaf(candidateIdx, newVal);
                } else {
                    stateNewValues.push(oldVal.toString());
                }

                statePathElements.push(proof.pathElements.map(e => e.toString()));
            }
        }

        const postStateRoot = this.stateTree.getRoot();
        console.log(`[BATCH] postStateRoot: ${postStateRoot.toString().substring(0, 20)}...`);

        // Batch nullifier commitment
        const batchNullifierHash = this.F.toObject(
            this.poseidon(nullifierHashes.map(n => BigInt(n)))
        );

        const batchInput = {
            preStateRoot: preStateRoot.toString(),
            postStateRoot: postStateRoot.toString(),
            batchNullifierHash: batchNullifierHash.toString(),
            voterMerkleRoot: voterMerkleRoot.toString(),
            candidates,
            votes,
            nullifierHashes,
            isNoOp: isNoOps,
            stateLeafIndices,
            stateOldValues,
            stateNewValues,
            statePathElements
        };

        const realNullifiers = nullifierHashes.filter((_, idx) => isNoOps[idx] === "0");

        return {
            batchInput,
            preStateRoot: preStateRoot.toString(),
            postStateRoot: postStateRoot.toString(),
            batchNullifierHash: batchNullifierHash.toString(),
            nullifierList: realNullifiers,
            voteCount: realVotes.length
        };
    }
}

module.exports = { TwoLayerBatcher, BATCH_SIZE, NUM_CANDIDATES };
