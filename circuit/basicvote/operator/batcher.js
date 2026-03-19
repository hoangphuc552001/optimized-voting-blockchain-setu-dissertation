const { buildPoseidon } = require("circomlibjs");

const BATCH_SIZE = 16;
const NUM_CANDIDATES = 5;

class Batcher {
    constructor(stateTree, batchSize = BATCH_SIZE) {
        this.stateTree = stateTree;
        this.batchSize = batchSize;
        this.poseidon = null;
        this.F = null;
    }

    async init() {
        this.poseidon = await buildPoseidon();
        this.F = this.poseidon.F;
        console.log("[BATCHER] Initialized with batch size:", this.batchSize);
    }

    assembleBatch(votes, voterMerkleRoot, electionId, voterProofsData, voterSecretsData) {
        console.log(`[BATCH] Assembling batch with ${votes.length} vote(s)...`);

        const realVotes = votes.slice(0, this.batchSize);
        const paddedVotes = [...realVotes];

        while (paddedVotes.length < this.batchSize) {
            paddedVotes.push({
                nullifierHash: "0",
                candidate: 0,
                vote: 0,
                ballotHash: "0",
                isNoOp: true,
                voterSecret: "0",
                electionId: "0",
                salt: "0"
            });
        }

        const preStateRoot = this.stateTree.getRoot();
        console.log(`[BATCH] preStateRoot: ${preStateRoot.toString().substring(0, 20)}...`);

        const voterSecrets = [];
        const electionIds = [];
        const candidates = [];
        const votesArr = [];
        const salts = [];
        const nullifierHashes = [];
        const ballotHashes = [];
        const isNoOps = [];
        const voterPathElements = [];
        const voterPathIndices = [];
        const stateLeafIndices = [];
        const stateOldValues = [];
        const stateNewValues = [];
        const statePathElements = [];

        for (let i = 0; i < this.batchSize; i++) {
            const v = paddedVotes[i];
            const isNoOp = v.isNoOp || false;
            isNoOps.push(isNoOp ? "1" : "0");

            if (isNoOp) {
                voterSecrets.push("0");
                electionIds.push("0");
                candidates.push("0");
                votesArr.push("0");
                salts.push("0");
                nullifierHashes.push("0");
                ballotHashes.push("0");

                const emptyPath = new Array(10).fill("0");
                const emptyIndices = new Array(10).fill(0);
                voterPathElements.push(emptyPath);
                voterPathIndices.push(emptyIndices);

                const candidateIdx = 0;
                const oldVal = this.stateTree.getLeaf(candidateIdx);
                const proof = this.stateTree.getProof(candidateIdx);

                stateLeafIndices.push(candidateIdx.toString());
                stateOldValues.push(oldVal.toString());
                stateNewValues.push(oldVal.toString());
                statePathElements.push(proof.pathElements.map(e => e.toString()));
            } else {
                const voterIdx = v.voterIndex !== undefined ? v.voterIndex : 0;
                const voterProof = voterProofsData ? voterProofsData.proofs[voterIdx] : null;
                const voterSecret = voterSecretsData ? voterSecretsData.voters[voterIdx] : null;

                voterSecrets.push(voterSecret ? BigInt("0x" + voterSecret.secret).toString() : "0");
                electionIds.push(electionId.toString());
                candidates.push(v.candidate.toString());
                votesArr.push(v.vote.toString());
                salts.push(v.salt || "0");
                nullifierHashes.push(v.nullifierHash.toString());
                ballotHashes.push(v.ballotHash.toString());

                if (voterProof) {
                    voterPathElements.push(voterProof.pathElements.map(e => e.toString()));
                    voterPathIndices.push(voterProof.pathIndices);
                } else {
                    voterPathElements.push(new Array(10).fill("0"));
                    voterPathIndices.push(new Array(10).fill(0));
                }

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

        const batchNullifierHash = this.F.toObject(
            this.poseidon(nullifierHashes.map(n => BigInt(n)))
        );

        const batchInput = {
            preStateRoot: preStateRoot.toString(),
            postStateRoot: postStateRoot.toString(),
            batchNullifierHash: batchNullifierHash.toString(),
            voterMerkleRoot: voterMerkleRoot.toString(),
            voterSecrets,
            electionIds,
            candidates,
            votes: votesArr,
            salts,
            nullifierHashes,
            ballotHashes,
            isNoOp: isNoOps,
            voterPathElements,
            voterPathIndices,
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

module.exports = { Batcher, BATCH_SIZE, NUM_CANDIDATES };
