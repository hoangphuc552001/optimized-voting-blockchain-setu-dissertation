const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

class Mempool {
    constructor(verificationKeyPath) {
        this.votes = [];
        this.usedNullifiers = new Set();
        this.vkeyPath = verificationKeyPath;
        this.vkey = null;
    }

    async init() {
        if (this.vkeyPath && fs.existsSync(this.vkeyPath)) {
            this.vkey = JSON.parse(fs.readFileSync(this.vkeyPath, "utf8"));
            console.log("[MEMPOOL] Verification key loaded from", this.vkeyPath);
        } else {
            console.log("[MEMPOOL] No verification key found, skipping per-vote proof validation");
        }
    }

    async addVote(voteData) {
        const { nullifierHash, candidate, vote, ballotHash, proof, publicSignals } = voteData;

        if (!nullifierHash || candidate === undefined || vote === undefined) {
            throw new Error("Missing required vote fields");
        }

        if (this.usedNullifiers.has(nullifierHash.toString())) {
            throw new Error("Duplicate nullifier: vote already submitted");
        }

        if (vote !== 0 && vote !== 1) {
            throw new Error("Invalid vote value: must be 0 or 1");
        }

        if (candidate < 0 || candidate >= 5) {
            throw new Error("Invalid candidate: must be 0-4");
        }

        if (this.vkey && proof && publicSignals) {
            try {
                const isValid = await snarkjs.groth16.verify(this.vkey, publicSignals, proof);
                if (!isValid) {
                    throw new Error("Invalid per-vote ZK proof");
                }
                console.log("[MEMPOOL] Per-vote proof verified for nullifier", nullifierHash.toString().substring(0, 16) + "...");
            } catch (err) {
                throw new Error("Proof verification failed: " + err.message);
            }
        }

        this.usedNullifiers.add(nullifierHash.toString());

        this.votes.push({
            nullifierHash: nullifierHash.toString(),
            candidate: Number(candidate),
            vote: Number(vote),
            ballotHash: ballotHash ? ballotHash.toString() : "0",
            proof,
            publicSignals,
            timestamp: Date.now()
        });

        console.log(`[MEMPOOL] Vote accepted. Mempool size: ${this.votes.length}`);
        return { success: true, mempoolSize: this.votes.length };
    }

    takeVotes(count) {
        return this.votes.splice(0, count);
    }

    size() {
        return this.votes.length;
    }

    getStatus() {
        return {
            pendingVotes: this.votes.length,
            totalNullifiers: this.usedNullifiers.size
        };
    }
}

module.exports = { Mempool };
