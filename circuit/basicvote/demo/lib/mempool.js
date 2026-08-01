const snarkjs = require("snarkjs");

/**
 * DemoMempool — the operator's admission control, instrumented for teaching.
 *
 * Unlike operator/mempool.js this returns the *full list* of checks it ran with
 * a pass/fail for each, so the UI can show which rung of the defence ladder a
 * vote fell off. It also supports a "malicious operator" mode: the checks still
 * run and are still reported, but a failing vote is forwarded anyway — which is
 * what lets the demo prove that Layer 1 catches what a complicit operator lets
 * through.
 */
class DemoMempool {
    constructor(vkey, election) {
        this.vkey = vkey;
        this.election = election;
        this.votes = [];
        this.seenNullifiers = new Set();
    }

    reset() {
        this.votes = [];
        this.seenNullifiers = new Set();
    }

    size() {
        return this.votes.length;
    }

    /**
     * @param {object} submission { proof, publicSignals, label }
     * @param {boolean} maliciousOperator forward the vote even if a check fails
     */
    async accept(submission, maliciousOperator = false) {
        const { proof, publicSignals, label } = submission;
        const checks = [];
        const record = (name, passed, detail) => checks.push({ name, passed, detail });

        if (!proof || !Array.isArray(publicSignals) || publicSignals.length !== 5) {
            record("well-formed submission", false, "expected a proof and 5 public signals");
            return { accepted: false, checks, failedAt: "well-formed submission" };
        }
        record("well-formed submission", true, "proof + 5 public signals");

        const [nullifierHash, candidate, vote, voterMerkleRoot, electionId] = publicSignals;

        // --- The check that actually matters: is this a real Groth16 proof? ---
        let proofValid = false;
        let verifyMs = 0;
        try {
            const t0 = Date.now();
            proofValid = await snarkjs.groth16.verify(this.vkey, publicSignals, proof);
            verifyMs = Date.now() - t0;
        } catch (err) {
            proofValid = false;
            verifyMs = 0;
        }
        record(
            "Groth16 proof verifies",
            proofValid,
            proofValid ? `snarkjs verify → true (${verifyMs} ms)` : "snarkjs verify → false"
        );

        const rootOk = voterMerkleRoot === this.election.voterMerkleRoot;
        record(
            "voter Merkle root matches election",
            rootOk,
            rootOk ? shorten(voterMerkleRoot) : `proof root ${shorten(voterMerkleRoot)} ≠ election root ${shorten(this.election.voterMerkleRoot)}`
        );

        const eidOk = electionId === String(this.election.electionId);
        record(
            "election ID matches",
            eidOk,
            eidOk ? electionId : `proof electionId ${electionId} ≠ ${this.election.electionId}`
        );

        const ballotOk = (vote === "0" || vote === "1") && Number(candidate) < this.election.numCandidates;
        record(
            "ballot well-formed",
            ballotOk,
            `candidate=${candidate}, vote=${vote}`
        );

        const fresh = !this.seenNullifiers.has(nullifierHash);
        record(
            "nullifier unseen in this mempool",
            fresh,
            fresh ? shorten(nullifierHash) : `${shorten(nullifierHash)} already in mempool`
        );

        const failed = checks.find(c => !c.passed);

        if (failed && !maliciousOperator) {
            return { accepted: false, checks, failedAt: failed.name };
        }

        this.seenNullifiers.add(nullifierHash);
        this.votes.push({
            proof,
            publicSignals,
            nullifierHash,
            candidate: Number(candidate),
            vote: Number(vote),
            label: label || null,
            forwardedDespiteFailure: Boolean(failed),
            failedCheck: failed ? failed.name : null,
            receivedAt: Date.now()
        });

        return {
            accepted: true,
            checks,
            failedAt: failed ? failed.name : null,
            forwardedDespiteFailure: Boolean(failed),
            mempoolSize: this.votes.length
        };
    }

    take(count) {
        return this.votes.splice(0, count);
    }

    peek() {
        return this.votes.map((v, i) => ({
            index: i,
            nullifierHash: v.nullifierHash,
            candidate: v.candidate,
            vote: v.vote,
            label: v.label,
            forwardedDespiteFailure: v.forwardedDespiteFailure,
            failedCheck: v.failedCheck
        }));
    }
}

function shorten(x) {
    const s = String(x);
    return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

module.exports = { DemoMempool, shorten };
