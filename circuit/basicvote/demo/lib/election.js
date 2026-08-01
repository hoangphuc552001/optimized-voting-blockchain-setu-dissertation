const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

const ROOT = path.join(__dirname, "..", "..");

const CANDIDATES = [
    { id: 0, name: "Ada Lovelace" },
    { id: 1, name: "Alan Turing" },
    { id: 2, name: "Grace Hopper" },
    { id: 3, name: "Katherine Johnson" },
    { id: 4, name: "Edsger Dijkstra" }
];

/**
 * Election — the public parameters everybody in the demo agrees on, plus the
 * per-voter credentials the demo hands to the simulated voter device.
 *
 * In a real deployment merkleProofs.json is public and voter-secrets.json does
 * not exist as a file at all: each voter generates and keeps their own secret.
 * The demo holds all 16 so that one presenter can play every voter; the UI says
 * so explicitly rather than pretending otherwise.
 */
class Election {
    constructor(proofsData, secretsData, poseidon) {
        this.proofsData = proofsData;
        this.secretsData = secretsData;
        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.electionId = proofsData.electionId;
        this.voterMerkleRoot = proofsData.merkleRoot;
        this.levels = proofsData.levels;
        this.numCandidates = CANDIDATES.length;
        this.candidates = CANDIDATES;
    }

    static async load() {
        const proofsData = JSON.parse(fs.readFileSync(path.join(ROOT, "merkleProofs.json"), "utf8"));
        const secretsData = JSON.parse(fs.readFileSync(path.join(ROOT, "voter-secrets.json"), "utf8"));
        const poseidon = await buildPoseidon();
        return new Election(proofsData, secretsData, poseidon);
    }

    get voterCount() {
        return Math.min(this.proofsData.proofs.length, this.secretsData.voters.length);
    }

    roster() {
        return this.proofsData.proofs.slice(0, this.voterCount).map((p, i) => ({
            index: i,
            voterId: p.voterId,
            name: p.name,
            commitment: p.leaf
        }));
    }

    /** Everything a voter device needs to build a witness locally. */
    credentials(index) {
        const p = this.proofsData.proofs[index];
        const s = this.secretsData.voters[index];
        if (!p || !s) throw new Error(`No such voter: ${index}`);

        const secret = BigInt("0x" + s.secret);
        const nullifierHash = this.F.toObject(this.poseidon([secret, BigInt(this.electionId)]));

        // Pre-computed here so the cross-election replay attack can build a
        // *consistent* witness in the browser without ever posting a secret
        // back to this server. Provisioning a simulated voter device is the
        // only point at which the secret crosses the wire, and it crosses
        // outward only.
        const altNullifierHash = this.F.toObject(this.poseidon([secret, BigInt(Election.ALT_ELECTION_ID)]));

        return {
            index,
            name: p.name,
            voterSecret: secret.toString(),
            leaf: p.leaf,
            pathElements: p.pathElements,
            pathIndices: p.pathIndices,
            nullifierHash: nullifierHash.toString(),
            altElectionId: String(Election.ALT_ELECTION_ID),
            altNullifierHash: altNullifierHash.toString(),
            voterMerkleRoot: this.voterMerkleRoot,
            electionId: String(this.electionId)
        };
    }

    /**
     * Attack material: a voter registry the attacker invented, containing only
     * themselves. Produces a genuinely valid Groth16 proof — against the wrong
     * root. Nothing in the circuit can catch this; only the chain can, because
     * only the chain knows which root is the real one.
     */
    forgedRegistry() {
        const F = this.F;
        const levels = this.levels;
        const numLeaves = 2 ** levels;

        // A secret the attacker chose themselves, not issued by the registrar.
        const rogueSecret = BigInt(
            "0x" + "deadbeef".repeat(8)
        ) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

        const rogueLeaf = F.toObject(this.poseidon([rogueSecret]));

        const leaves = new Array(numLeaves).fill(0n);
        leaves[0] = rogueLeaf;

        const tree = [leaves];
        for (let level = 0; level < levels; level++) {
            const cur = tree[level];
            const next = [];
            for (let i = 0; i < cur.length; i += 2) {
                next.push(F.toObject(this.poseidon([cur[i], cur[i + 1] || 0n])));
            }
            tree.push(next);
        }

        const pathElements = [];
        const pathIndices = [];
        let idx = 0;
        for (let level = 0; level < levels; level++) {
            const cur = tree[level];
            const isLeft = idx % 2 === 0;
            const sib = isLeft ? idx + 1 : idx - 1;
            pathElements.push((sib < cur.length ? cur[sib] : 0n).toString());
            pathIndices.push(isLeft ? 0 : 1);
            idx = Math.floor(idx / 2);
        }

        const nullifierHash = F.toObject(this.poseidon([rogueSecret, BigInt(this.electionId)]));
        const altNullifierHash = F.toObject(this.poseidon([rogueSecret, BigInt(Election.ALT_ELECTION_ID)]));

        return {
            index: -1,
            name: "Mallory (self-registered)",
            voterSecret: rogueSecret.toString(),
            leaf: rogueLeaf.toString(),
            pathElements,
            pathIndices,
            nullifierHash: nullifierHash.toString(),
            altElectionId: String(Election.ALT_ELECTION_ID),
            altNullifierHash: altNullifierHash.toString(),
            voterMerkleRoot: tree[levels][0].toString(),
            electionId: String(this.electionId)
        };
    }
}

/** The "other election" a cross-election replay attack pretends to belong to. */
Election.ALT_ELECTION_ID = 999;

module.exports = { Election, CANDIDATES };
