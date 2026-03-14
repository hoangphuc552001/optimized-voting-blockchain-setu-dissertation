const express = require("express");
const fs = require("fs");
const path = require("path");
const { StateTree } = require("./stateTree");
const { Mempool } = require("./mempool");
const { Batcher, BATCH_SIZE, NUM_CANDIDATES } = require("./batcher");
const { Prover } = require("./prover");
const { Submitter } = require("./submitter");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = process.env.OPERATOR_PORT || 3000;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const VOTING_ROLLUP_ADDRESS = process.env.VOTING_ROLLUP_ADDRESS;
const BATCH_TIMEOUT_MS = parseInt(process.env.BATCH_TIMEOUT_MS || "60000");
const WASM_PATH = process.env.WASM_PATH || path.join(__dirname, "..", "build", "BatchVote_js", "BatchVote.wasm");
const ZKEY_PATH = process.env.ZKEY_PATH || path.join(__dirname, "..", "build", "batch_0001.zkey");
const VKEY_PATH = process.env.VKEY_PATH || path.join(__dirname, "..", "build", "verification_key.json");
const STATE_LEVELS = 5;

let stateTree;
let mempool;
let batcher;
let prover;
let submitter;
let batchTimer = null;
let batchesProcessed = 0;

async function initialize() {
    console.log("=== ZK Rollup Voting Operator ===\n");

    stateTree = await StateTree.create(STATE_LEVELS);
    console.log("[INIT] State tree created (levels:", STATE_LEVELS, ", leaves:", stateTree.numLeaves, ")");
    console.log("[INIT] Initial state root:", stateTree.getRoot().toString().substring(0, 20) + "...");

    mempool = new Mempool(VKEY_PATH);
    await mempool.init();

    batcher = new Batcher(stateTree, BATCH_SIZE);
    await batcher.init();

    if (fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH)) {
        prover = new Prover(WASM_PATH, ZKEY_PATH);
        console.log("[INIT] Prover initialized with circuit artifacts");
    } else {
        console.log("[INIT] Circuit artifacts not found - proof generation disabled");
        console.log("[INIT] Run circuit compilation and trusted setup first");
        prover = null;
    }

    if (PRIVATE_KEY && VOTING_ROLLUP_ADDRESS) {
        submitter = new Submitter(RPC_URL, PRIVATE_KEY, VOTING_ROLLUP_ADDRESS);
        await submitter.init();
    } else {
        console.log("[INIT] L1 submitter disabled - set PRIVATE_KEY and VOTING_ROLLUP_ADDRESS in .env");
        submitter = null;
    }

    console.log("\n[INIT] Configuration:");
    console.log("  Batch size:", BATCH_SIZE);
    console.log("  Batch timeout:", BATCH_TIMEOUT_MS, "ms");
    console.log("  RPC URL:", RPC_URL);
    console.log("  Prover:", prover ? "enabled" : "disabled");
    console.log("  L1 Submitter:", submitter ? "enabled" : "disabled");
    console.log("");
}

async function processBatch() {
    if (mempool.size() === 0) {
        console.log("[BATCH] No votes to process");
        return { success: false, reason: "No votes" };
    }

    const votes = mempool.takeVotes(BATCH_SIZE);
    console.log(`\n[BATCH] Processing batch #${batchesProcessed} with ${votes.length} vote(s)...`);

    const proofsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "merkleProofs.json"), "utf8"));
    const secretsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "voter-secrets.json"), "utf8"));
    const voterMerkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = proofsData.electionId;

    const batchResult = batcher.assembleBatch(votes, voterMerkleRoot, electionId, proofsData, secretsData);

    let proofResult = null;
    if (prover) {
        proofResult = await prover.generateProof(batchResult.batchInput);
        console.log("[PROVE] Batch proof generated successfully");
    } else {
        console.log("[PROVE] Skipping proof generation (prover not available)");
        proofResult = {
            formattedProof: {
                a: ["0", "0"],
                b: [["0", "0"], ["0", "0"]],
                c: ["0", "0"]
            }
        };
    }

    if (submitter) {
        const txResult = await submitter.submitBatch(
            proofResult.formattedProof,
            batchResult.postStateRoot,
            batchResult.batchNullifierHash,
            batchResult.nullifierList
        );
        console.log(`[L1] postStateRoot: ${batchResult.postStateRoot.substring(0, 20)}...`);
    } else {
        console.log("[L1] Skipping L1 submission (submitter not available)");
    }

    batchesProcessed++;

    return {
        success: true,
        batchIndex: batchesProcessed - 1,
        voteCount: votes.length,
        preStateRoot: batchResult.preStateRoot,
        postStateRoot: batchResult.postStateRoot,
        batchNullifierHash: batchResult.batchNullifierHash
    };
}

function startBatchTimer() {
    if (batchTimer) clearInterval(batchTimer);
    batchTimer = setInterval(async () => {
        if (mempool.size() >= BATCH_SIZE) {
            try {
                await processBatch();
            } catch (err) {
                console.error("[BATCH] Auto-batch failed:", err.message);
            }
        }
    }, BATCH_TIMEOUT_MS);
}

const app = express();
app.use(express.json());

app.post("/api/vote", async (req, res) => {
    try {
        const result = await mempool.addVote(req.body);

        if (mempool.size() >= BATCH_SIZE) {
            console.log("[BATCH] Batch threshold reached, triggering batch...");
            setImmediate(() => processBatch().catch(err =>
                console.error("[BATCH] Auto-batch failed:", err.message)
            ));
        }

        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post("/api/force-batch", async (req, res) => {
    try {
        const result = await processBatch();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/tally", (req, res) => {
    const tallies = stateTree.getTallies(NUM_CANDIDATES);
    const totalVotes = stateTree.getTotalVotes(NUM_CANDIDATES);

    res.json({
        stateRoot: stateTree.getRoot().toString(),
        candidates: tallies,
        totalVotes,
        batchesProcessed
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        operator: "running",
        mempool: mempool.getStatus(),
        stateRoot: stateTree.getRoot().toString(),
        batchesProcessed,
        batchSize: BATCH_SIZE,
        proverEnabled: !!prover,
        submitterEnabled: !!submitter
    });
});

async function main() {
    await initialize();

    startBatchTimer();

    app.listen(PORT, () => {
        console.log(`\n[SERVER] Rollup operator listening on http://localhost:${PORT}`);
        console.log("[SERVER] Endpoints:");
        console.log("  POST /api/vote         - Submit a vote");
        console.log("  POST /api/force-batch  - Force batch processing");
        console.log("  GET  /api/tally        - Get current tallies");
        console.log("  GET  /api/status       - Operator status\n");
    });
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
