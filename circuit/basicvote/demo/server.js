/**
 * ZKER demo server — the OPERATOR half of the demo.
 *
 * This is the two-layer (VotingRollupV2) counterpart of operator/index.js:
 * it drives the same operator modules described in the dissertation
 * (StateTree, TwoLayerBatcher) but against the V2 contracts, and exposes them
 * over HTTP so a browser can play the voter.
 *
 * Layer 1 proving happens in the BROWSER, not here. This server never receives
 * a voter secret — which is the whole privacy claim, made literal.
 *
 *   Terminal 1:  npx hardhat node
 *   Terminal 2:  node demo/server.js
 *   Browser:     http://localhost:4000
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

const { Chain } = require("./lib/chain");
const { Election } = require("./lib/election");
const explorer = require("./lib/explorer");
const { DemoMempool } = require("./lib/mempool");
const { StateTree } = require("../operator/stateTree");
const { TwoLayerBatcher } = require("../operator/twoLayerBatcher");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT = path.join(__dirname, "..");
const PORT = process.env.DEMO_PORT || 4000;
const BATCH_SIZE = 16;
const STATE_LEVELS = 5;
const SPOT_CHECK_COUNT = Number(process.env.SPOT_CHECK_COUNT || 2);

// "local" (default) drives a hardhat node; "sepolia" submits to the public
// testnet so every transaction has a real Etherscan page.
const NETWORK = (process.env.DEMO_NETWORK || "local").toLowerCase();
const SEPOLIA_DEPLOY = process.env.SEPOLIA_DEPLOY === "1";
const SEPOLIA_ADDRESSES = path.join(ROOT, "sepolia-v2-addresses.json");

const PATHS = {
    voteWasm: path.join(ROOT, "build", "vote_proof", "VoteProof_js", "VoteProof.wasm"),
    voteZkey: path.join(ROOT, "build", "vote_proof_0001.zkey"),
    voteVkey: path.join(ROOT, "build", "vote_proof_verification_key.json"),
    batchWasm: path.join(ROOT, "build", "batch_state", "BatchStateUpdate_js", "BatchStateUpdate.wasm"),
    batchZkey: path.join(ROOT, "build", "batch_state_0001.zkey"),
    batchVkey: path.join(ROOT, "build", "batch_state_verification_key.json"),
    snarkjsBundle: path.join(ROOT, "node_modules", "snarkjs", "build", "snarkjs.min.js")
};

const FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

// ---------------------------------------------------------------- demo state

const D = {
    election: null,
    chain: null,
    stateTree: null,
    batcher: null,
    mempool: null,
    voteVkey: null,
    batchVkey: null,
    batches: [],          // one entry per submitted (or attempted) batch
    baselineGas: null,    // { rollupPerVote, perVoteZK, plain, sampleSize }
    unmeasuredVotes: [],  // real vote proofs available for the baseline comparison
    log: []
};

function logEvent(pane, message, level = "info") {
    const entry = { t: Date.now(), pane, message, level };
    D.log.push(entry);
    if (D.log.length > 400) D.log.shift();
    const tag = level === "error" ? "!" : level === "warn" ? "~" : " ";
    console.log(`[${pane}]${tag} ${message}`);
    return entry;
}

function requireFiles() {
    const missing = Object.entries(PATHS).filter(([, p]) => !fs.existsSync(p));
    if (missing.length) {
        console.error("\nMissing build artifacts:\n");
        missing.forEach(([k, p]) => console.error(`  ${k}: ${p}`));
        console.error("\nCompile the circuits first — see output/run_full_flow_zk_rollup_2_layer.ps1 steps 2 and 3.\n");
        process.exit(1);
    }
}

async function resetElection({} = {}) {
    D.stateTree = await StateTree.create(STATE_LEVELS);
    D.batcher = new TwoLayerBatcher(D.stateTree, BATCH_SIZE);
    await D.batcher.init();
    D.mempool = new DemoMempool(D.voteVkey, D.election);
    D.batches = [];
    D.baselineGas = null;
    D.unmeasuredVotes = [];
    D.log = [];

    const emptyRoot = BigInt(D.stateTree.getRoot());
    let addresses;

    // On Sepolia, reuse the already-deployed election when it is still pristine.
    // Redeploying five contracts to a public testnet costs real ETH and about
    // two minutes, so it has to be asked for explicitly.
    if (NETWORK === "sepolia" && !SEPOLIA_DEPLOY && fs.existsSync(SEPOLIA_ADDRESSES)) {
        const saved = JSON.parse(fs.readFileSync(SEPOLIA_ADDRESSES, "utf8"));
        addresses = await D.chain.attachElection(saved, {
            expectedStateRoot: emptyRoot,
            expectedVoterRoot: D.election.voterMerkleRoot
        });
        logEvent("L1", `Attached to the deployed Sepolia election at ${addresses.votingRollupV2}`);
        logEvent("L1", `spotCheckCount on chain: ${D.chain.spotCheckCount}`);
    } else {
        if (NETWORK === "sepolia") {
            logEvent("L1", "Deploying a fresh election to Sepolia — this costs testnet ETH and takes ~2 min", "warn");
        }
        addresses = await D.chain.deployElection({
            initialStateRoot: emptyRoot,
            voterMerkleRoot: BigInt(D.election.voterMerkleRoot),
            electionId: D.election.electionId,
            spotCheckCount: SPOT_CHECK_COUNT
        });
        logEvent("L1", `Election deployed — rollup at ${addresses.votingRollupV2}`);

        if (NETWORK === "sepolia") {
            fs.writeFileSync(SEPOLIA_ADDRESSES, JSON.stringify({
                network: "sepolia",
                version: "v2-two-layer",
                ...addresses,
                electionId: D.election.electionId,
                voterMerkleRoot: D.election.voterMerkleRoot,
                initialStateRoot: emptyRoot.toString(),
                spotCheckCount: SPOT_CHECK_COUNT,
                deployer: D.chain.adminAddress,
                timestamp: new Date().toISOString()
            }, null, 2));
            logEvent("L1", `Addresses written to ${path.basename(SEPOLIA_ADDRESSES)}`);
        }
    }

    logEvent("L1", `Initial state root ${short(D.stateTree.getRoot())} (empty tally tree)`);
    return addresses;
}

/** Effective spot-check count — a reused contract has whatever it was deployed with. */
function spotChecks() {
    return D.chain.spotCheckCount !== undefined ? D.chain.spotCheckCount : SPOT_CHECK_COUNT;
}

function short(x) {
    const s = String(x);
    return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

function snapshotTree() {
    return D.stateTree.leaves.map(l => BigInt(l));
}

function restoreTree(snapshot) {
    D.stateTree.leaves = snapshot.map(l => BigInt(l));
    D.stateTree._buildTree();
}

/**
 * A rejected batch must leave the operator exactly as it was: same state tree,
 * same pending votes. Otherwise a failed attack would silently destroy honest
 * ballots, and the presenter would have to re-cast them mid-demo.
 */
function rollback(treeSnapshot, takenVotes) {
    restoreTree(treeSnapshot);
    D.mempool.votes.unshift(...takenVotes);
}

// ------------------------------------------------------------------- the app

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.use("/", express.static(path.join(__dirname, "public")));
app.get("/vendor/snarkjs.min.js", (_req, res) => res.sendFile(PATHS.snarkjsBundle));
app.get("/zk/VoteProof.wasm", (_req, res) => res.sendFile(PATHS.voteWasm));
app.get("/zk/VoteProof.zkey", (_req, res) => res.sendFile(PATHS.voteZkey));
app.get("/zk/VoteProof.vkey.json", (_req, res) => res.sendFile(PATHS.voteVkey));

// --- election + roster ------------------------------------------------------

app.get("/api/election", async (_req, res) => {
    const chainState = await D.chain.getState();
    res.json({
        electionId: D.election.electionId,
        voterMerkleRoot: D.election.voterMerkleRoot,
        levels: D.election.levels,
        candidates: D.election.candidates,
        voters: D.election.roster(),
        batchSize: BATCH_SIZE,
        spotCheckCount: spotChecks(),
        addresses: D.chain.addresses,
        addressUrls: Object.fromEntries(
            Object.entries(D.chain.addresses).map(([k, a]) => [k, D.chain.addressUrl(a)])
        ),
        network: D.chain.network,
        explorerBase: D.chain.explorerBase,
        rpcUrl: D.chain.network === "sepolia" ? "Sepolia via Alchemy" : D.chain.rpcUrl,
        chainId: D.chain.chainId,
        operatorAddress: D.chain.adminAddress,
        circuits: {
            voteProof: { constraints: 6179, privateInputs: 21, publicInputs: 5 },
            batchStateUpdate: { constraints: 100116, privateInputs: 192, publicInputs: 4 }
        },
        chain: chainState
    });
});

app.get("/api/voter/:index/credentials", (req, res) => {
    try {
        res.json(D.election.credentials(Number(req.params.index)));
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

/**
 * Verified historical transactions from the public Sepolia deployment.
 *
 * Available in every mode, including local: it lets a locally-run demo point at
 * real, already-mined Ethereum without spending anything or depending on the
 * network being up. Re-check them before a viva with demo/tools/verifySepolia.js.
 */
app.get("/api/sepolia-reference", (_req, res) => {
    const p = path.join(__dirname, "sepolia-reference.json");
    if (!fs.existsSync(p)) return res.json({ transactions: [] });
    const ref = JSON.parse(fs.readFileSync(p, "utf8"));
    res.json({
        ...ref,
        transactions: ref.transactions.map(t => ({
            ...t,
            url: `${ref.explorerBase}/tx/${t.hash}`
        })),
        contractUrl: `${ref.explorerBase}/address/${ref.votingRollupV2}`
    });
});

app.get("/api/attack/forged-registry", (_req, res) => {
    logEvent("VOTER", "Attacker built a private voter registry containing only themselves", "warn");
    res.json(D.election.forgedRegistry());
});

// --- vote submission --------------------------------------------------------

app.post("/api/vote", async (req, res) => {
    const { proof, publicSignals, label, maliciousOperator } = req.body || {};

    const result = await D.mempool.accept({ proof, publicSignals, label }, Boolean(maliciousOperator));

    if (!result.accepted) {
        logEvent("OPERATOR", `Vote rejected — failed check: ${result.failedAt}`, "error");
        return res.status(400).json(result);
    }

    if (result.forwardedDespiteFailure) {
        logEvent("OPERATOR", `MALICIOUS: forwarded a vote that failed "${result.failedAt}"`, "warn");
    } else {
        logEvent("OPERATOR", `Vote accepted — nullifier ${short(publicSignals[0])}, mempool ${result.mempoolSize}/${BATCH_SIZE}`);
    }

    res.json(result);
});

/**
 * Stage-setting helper: generate real Layer-1 proofs here, on the server, for
 * voters the presenter has not played by hand, so a batch can reach a realistic
 * size without casting sixteen ballots live.
 *
 * These are genuine VoteProof proofs — the shortcut is only about *who* runs
 * the prover, and it exists so the gas figures in the L1 pane are measured at a
 * realistic batch size rather than at n=3.
 */
app.post("/api/prefill", async (req, res) => {
    const want = Number((req.body && req.body.count) || 0) || (BATCH_SIZE - D.mempool.size());
    const added = [];

    for (let i = 0; i < D.election.voterCount && added.length < want; i++) {
        const creds = D.election.credentials(i);
        if (D.mempool.seenNullifiers.has(creds.nullifierHash)) continue;
        if (D.mempool.size() >= BATCH_SIZE) break;

        const candidate = i % D.election.numCandidates;
        const input = {
            voterSecret: creds.voterSecret,
            voterPathElements: creds.pathElements,
            voterPathIndices: creds.pathIndices,
            nullifierHash: creds.nullifierHash,
            candidate: String(candidate),
            vote: "1",
            voterMerkleRoot: creds.voterMerkleRoot,
            electionId: creds.electionId
        };

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, PATHS.voteWasm, PATHS.voteZkey);
        await D.mempool.accept({ proof, publicSignals, label: `${creds.name} (simulated device)` }, false);
        added.push({ voter: creds.name, candidate });
    }

    logEvent("OPERATOR", `Pre-filled ${added.length} simulated ballot(s); mempool ${D.mempool.size()}/${BATCH_SIZE}`);
    res.json({ added: added.length, detail: added, mempoolSize: D.mempool.size() });
});

// --- state ------------------------------------------------------------------

app.get("/api/state", async (_req, res) => {
    const chainState = await D.chain.getState();
    const tallies = D.stateTree.getTallies(D.election.numCandidates);

    res.json({
        mempool: D.mempool.peek(),
        operator: {
            stateRoot: D.stateTree.getRoot().toString(),
            tallies,
            totalVotes: D.stateTree.getTotalVotes(D.election.numCandidates)
        },
        chain: chainState,
        chainRootMatchesOperator: chainState.stateRoot === D.stateTree.getRoot().toString(),
        batches: D.batches,
        baselineGas: D.baselineGas,
        log: D.log.slice(-80)
    });
});

// --- batching + submission --------------------------------------------------

/**
 * The core of the demo. Runs the operator pipeline as a sequence of named
 * steps and reports the result of each, so the UI can show exactly where an
 * injected fault stops the process.
 *
 * attacks: {
 *   censorIndex:   int      drop a vote from the batch (liveness attack)
 *   swapCandidate: {index,to}  re-route a ballot to a different candidate
 *   inflateTally:  {extra}  add phantom votes to the last tallied candidate
 *   tamperProof:   bool     corrupt the batch proof before submitting
 * }
 */
app.post("/api/batch", async (req, res) => {
    const attacks = (req.body && req.body.attacks) || {};
    const steps = [];
    const step = (name, status, detail, extra = {}) => {
        const s = { name, status, detail, ...extra };
        steps.push(s);
        return s;
    };

    if (D.mempool.size() === 0) {
        return res.status(400).json({ ok: false, error: "Mempool is empty — cast some votes first." });
    }

    const treeSnapshot = snapshotTree();
    const taken = D.mempool.take(BATCH_SIZE);
    let votes = taken.map(v => ({ ...v }));

    step("collect from mempool", "ok", `${votes.length} vote(s) taken`);

    // Demo aid: spot-checking verifies only the first `spotCheckCount` proofs,
    // so a ballot that a complicit operator waved through would usually escape
    // it. We move such ballots to the front so the on-chain guard is exercised
    // on stage — and the UI says so, because that probabilistic coverage is
    // itself a finding: spot-checking is a sampling defence, not a guarantee.
    const suspicious = votes.filter(v => v.forwardedDespiteFailure);
    if (suspicious.length && suspicious.length < votes.length) {
        votes = [...suspicious, ...votes.filter(v => !v.forwardedDespiteFailure)];
        step("reorder for spot-check window", "note",
            `${suspicious.length} flagged ballot(s) moved to index 0 — with spotCheck=${spotChecks()} of ${BATCH_SIZE}, an unmoved ballot would escape checking with probability ${(1 - spotChecks() / BATCH_SIZE).toFixed(2)}`);
    }

    // ---- operator-side faults, applied before the batch is assembled --------

    if (attacks.censorIndex !== undefined && attacks.censorIndex !== null) {
        const idx = Number(attacks.censorIndex);
        const dropped = votes[idx];
        if (dropped) {
            votes = votes.filter((_, i) => i !== idx);
            logEvent("OPERATOR", `MALICIOUS: censored vote ${idx} (nullifier ${short(dropped.nullifierHash)})`, "warn");
            step("operator censors a vote", "attack", `dropped vote ${idx}; ${votes.length} remain`, { attack: "censor" });
        }
    }

    if (attacks.swapCandidate && votes[Number(attacks.swapCandidate.index)]) {
        const idx = Number(attacks.swapCandidate.index);
        const to = Number(attacks.swapCandidate.to);
        const from = votes[idx].candidate;
        votes[idx] = { ...votes[idx], candidate: to };
        logEvent("OPERATOR", `MALICIOUS: re-routed vote ${idx} from candidate ${from} to ${to}`, "warn");
        step("operator re-routes a ballot", "attack", `vote ${idx}: candidate ${from} → ${to}`, { attack: "swap" });
    }

    // ---- assemble ----------------------------------------------------------

    let batch;
    try {
        batch = D.batcher.assembleBatch(votes, BigInt(D.election.voterMerkleRoot));
        step("assemble state transitions", "ok",
            `${short(batch.preStateRoot)} → ${short(batch.postStateRoot)}`,
            { preStateRoot: batch.preStateRoot, postStateRoot: batch.postStateRoot,
              realVotes: votes.length, padded: BATCH_SIZE - votes.length });
    } catch (err) {
        rollback(treeSnapshot, taken);
        step("assemble state transitions", "failed", err.message);
        return res.json({ ok: false, steps, stoppedAt: "assemble state transitions" });
    }

    if (attacks.inflateTally) {
        const extra = Number(attacks.inflateTally.extra || 1);
        const lastReal = votes.length - 1;
        if (lastReal >= 0) {
            const cand = votes[lastReal].candidate;
            const inflated = BigInt(batch.batchInput.stateNewValues[lastReal]) + BigInt(extra);
            batch.batchInput.stateNewValues[lastReal] = inflated.toString();
            D.stateTree.updateLeaf(cand, inflated);
            batch.batchInput.postStateRoot = D.stateTree.getRoot().toString();
            batch.postStateRoot = batch.batchInput.postStateRoot;
            logEvent("OPERATOR", `MALICIOUS: inflated candidate ${cand} by +${extra} phantom vote(s)`, "warn");
            step("operator inflates the tally", "attack",
                `candidate ${cand} claimed +${extra} beyond the votes it holds`, { attack: "inflate" });
        }
    }

    // ---- prove (Layer 2) ---------------------------------------------------

    let batchProof, batchPublicSignals, proveMs;
    try {
        const t0 = Date.now();
        const out = await snarkjs.groth16.fullProve(batch.batchInput, PATHS.batchWasm, PATHS.batchZkey);
        proveMs = Date.now() - t0;
        batchProof = out.proof;
        batchPublicSignals = out.publicSignals;
        step("generate batch proof (100,116 constraints)", "ok",
            `${(proveMs / 1000).toFixed(2)} s → 8 field elements (~256 bytes)`,
            { proveMs, proofBytes: 256 });
        logEvent("OPERATOR", `Batch proof generated in ${(proveMs / 1000).toFixed(2)} s`);
    } catch (err) {
        rollback(treeSnapshot, taken);
        const detail = explainCircuitError(err);
        step("generate batch proof (100,116 constraints)", "blocked", detail, { raw: String(err.message).slice(0, 400) });
        logEvent("OPERATOR", `Batch proof generation FAILED — ${detail}`, "error");
        return res.json({
            ok: false, steps, stoppedAt: "generate batch proof",
            verdict: "The batch circuit refused to produce a witness. No proof exists, so nothing can be submitted."
        });
    }

    // ---- local verify ------------------------------------------------------

    const localOk = await snarkjs.groth16.verify(D.batchVkey, batchPublicSignals, batchProof);
    step("operator self-check (snarkjs verify)", localOk ? "ok" : "failed", `verify → ${localOk}`);

    // ---- tamper ------------------------------------------------------------

    let submittedProof = batchProof;
    if (attacks.tamperProof) {
        submittedProof = JSON.parse(JSON.stringify(batchProof));
        submittedProof.pi_a[0] = ((BigInt(submittedProof.pi_a[0]) + 1n) % FIELD).toString();
        const tamperedOk = await snarkjs.groth16.verify(D.batchVkey, batchPublicSignals, submittedProof);
        step("operator tampers with the proof", "attack",
            `pi_a[0] incremented by 1 → snarkjs verify → ${tamperedOk}`, { attack: "tamper" });
        logEvent("OPERATOR", "MALICIOUS: submitting a tampered batch proof", "warn");
    }

    // ---- submit ------------------------------------------------------------

    const submitStart = Date.now();
    const tx = await D.chain.submitBatch({
        batchProof: submittedProof,
        newStateRoot: batch.postStateRoot,
        batchNullifierHash: batch.batchNullifierHash,
        nullifierList: batch.nullifierList,
        voteProofs: votes,
        spotCheckCount: spotChecks()
    });
    const submitMs = Date.now() - submitStart;

    if (!tx.ok) {
        rollback(treeSnapshot, taken);

        // A public network can also fail for reasons that have nothing to do
        // with the protocol. Saying "the contract rejected this" when the real
        // problem was an empty wallet would misrepresent the result.
        if (tx.infrastructure) {
            step("submit to Ethereum L1", "failed", `network/account problem: ${tx.revert}`, { revert: tx.revert });
            logEvent("L1", `Submission failed (not a protocol rejection): ${tx.revert}`, "error");
            return res.json({
                ok: false, steps, stoppedAt: "submit to Ethereum L1", revert: tx.revert,
                infrastructure: true,
                verdict: `This was not a protocol rejection — the transaction never reached the contract's guards. ${tx.revert}`
            });
        }

        step("submit to Ethereum L1", "rejected", `revert: "${tx.revert}"`, { revert: tx.revert });
        logEvent("L1", `Batch REJECTED — revert "${tx.revert}"`, "error");
        return res.json({
            ok: false, steps, stoppedAt: "submit to Ethereum L1", revert: tx.revert,
            verdict: `Ethereum rejected the batch: "${tx.revert}". The operator's state has been rolled back.`
        });
    }

    const perVote = votes.length ? Math.round(tx.gasUsed / votes.length) : tx.gasUsed;
    step("submit to Ethereum L1", "ok",
        `${tx.gasUsed.toLocaleString()} gas total · ${perVote.toLocaleString()} gas/vote · ${tx.spotChecked} proof(s) spot-checked`,
        { gasUsed: tx.gasUsed, gasPerVote: perVote, txHash: tx.txHash, blockNumber: tx.blockNumber, submitMs });
    logEvent("L1", `Batch accepted — tx ${tx.txHash.slice(0, 12)}…, ${tx.gasUsed.toLocaleString()} gas`);

    const record = {
        index: D.batches.length,
        txHash: tx.txHash,
        txUrl: tx.txUrl || null,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        gasPerVote: perVote,
        voteCount: votes.length,
        padded: BATCH_SIZE - votes.length,
        preStateRoot: batch.preStateRoot,
        postStateRoot: batch.postStateRoot,
        batchNullifierHash: batch.batchNullifierHash,
        nullifierList: batch.nullifierList,
        proveMs,
        submitMs,
        spotChecked: tx.spotChecked,
        attacks: Object.keys(attacks).filter(k => attacks[k] !== undefined && attacks[k] !== null && attacks[k] !== false),
        censoredNullifier: null
    };

    if (attacks.censorIndex !== undefined && attacks.censorIndex !== null && taken[Number(attacks.censorIndex)]) {
        record.censoredNullifier = taken[Number(attacks.censorIndex)].nullifierHash;
    }

    D.batches.push(record);
    D.unmeasuredVotes.push(...votes.filter(v => !v.forwardedDespiteFailure));

    res.json({ ok: true, steps, batch: record });
});

// --- RQ3 baseline comparison ------------------------------------------------

app.post("/api/baselines/measure", async (_req, res) => {
    if (!D.unmeasuredVotes.length) {
        return res.status(400).json({ error: "No settled votes to replay. Submit a batch first." });
    }

    const sample = D.unmeasuredVotes.splice(0, D.unmeasuredVotes.length);
    const perVoteZK = [];
    const plain = [];

    for (let i = 0; i < sample.length; i++) {
        const v = sample[i];
        const zk = await D.chain.castPerVoteZK(v);
        if (zk.ok) perVoteZK.push(zk.gasUsed);

        const p = await D.chain.castPlain(
            BigInt(v.nullifierHash) % 1000000n,
            v.candidate,
            v.vote
        );
        if (p.ok) plain.push(p.gasUsed);
    }

    const mean = arr => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const rollupPerVote = D.batches.length
        ? Math.round(D.batches.reduce((a, b) => a + b.gasUsed, 0) / D.batches.reduce((a, b) => a + b.voteCount, 0))
        : null;

    D.baselineGas = {
        sampleSize: sample.length,
        rollupPerVote,
        perVoteZK: mean(perVoteZK),
        plain: mean(plain),
        savingsVsPerVoteZK: rollupPerVote && mean(perVoteZK)
            ? +(100 * (1 - rollupPerVote / mean(perVoteZK))).toFixed(1) : null,
        savingsVsPlain: rollupPerVote && mean(plain)
            ? +(100 * (1 - rollupPerVote / mean(plain))).toFixed(1) : null
    };

    logEvent("L1", `Baselines measured over ${sample.length} vote(s): rollup ${rollupPerVote} vs per-vote ZK ${mean(perVoteZK)} vs plain ${mean(plain)} gas/vote`);
    res.json(D.baselineGas);
});

// --- block explorer ---------------------------------------------------------

app.get("/api/explorer/overview", async (_req, res) => {
    try {
        const [blocks, txs] = await Promise.all([
            explorer.blocks(D.chain, Number(_req.query.blocks) || 10),
            explorer.recentTransactions(D.chain, Number(_req.query.txs) || 15)
        ]);
        res.json({
            chainId: D.chain.chainId,
            rpcUrl: D.chain.rpcUrl,
            head: blocks.length ? blocks[0].number : 0,
            deployBlock: D.chain.deployBlock,
            contracts: Object.entries(D.chain.addresses).map(([key, addr]) => ({ key, address: addr })),
            blocks,
            transactions: txs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/explorer/tx/:hash", async (req, res) => {
    try {
        res.json(await explorer.transaction(D.chain, req.params.hash));
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

app.get("/api/explorer/address/:addr", async (req, res) => {
    try {
        res.json(await explorer.address(D.chain, req.params.addr));
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// --- external observer ------------------------------------------------------

app.post("/api/observer/verify", async (req, res) => {
    const { txHash } = req.body || {};
    if (!txHash) return res.status(400).json({ error: "txHash required" });

    const steps = [];
    try {
        const cd = await D.chain.getBatchCalldata(txHash);
        steps.push({ name: "fetch calldata from the node", status: "ok",
            detail: `${cd.calldataBytes} bytes from block ${cd.blockNumber}, sender ${cd.from.slice(0, 10)}…` });

        const ev = await D.chain.getPreStateRootAt(txHash);
        if (!ev) throw new Error("BatchSubmitted event not found");
        steps.push({ name: "read BatchSubmitted event", status: "ok",
            detail: `batch ${ev.batchIndex}: ${short(ev.preStateRoot)} → ${short(ev.postStateRoot)}, ${ev.voteCount} vote(s)` });

        const publicSignals = [
            ev.preStateRoot,
            cd.newStateRoot,
            cd.batchNullifierHash,
            D.election.voterMerkleRoot
        ];
        steps.push({ name: "reconstruct public signals", status: "ok",
            detail: "[preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]" });

        const t0 = Date.now();
        const ok = await snarkjs.groth16.verify(D.batchVkey, publicSignals, cd.proof);
        const ms = Date.now() - t0;

        steps.push({ name: "snarkjs groth16 verify (published vkey)", status: ok ? "ok" : "failed",
            detail: `${ok ? "OK!" : "INVALID"} in ${ms} ms — no trust in the operator required` });

        logEvent("OBSERVER", `Independently re-verified batch ${ev.batchIndex}: ${ok ? "OK" : "INVALID"}`);
        res.json({ ok, steps, publicSignals, batchIndex: ev.batchIndex, verifyMs: ms });
    } catch (err) {
        steps.push({ name: "verification", status: "failed", detail: err.message });
        res.status(500).json({ ok: false, steps, error: err.message });
    }
});

// --- lifecycle + contract-level attacks -------------------------------------

app.post("/api/lifecycle/end-voting", async (_req, res) => {
    const r = await D.chain.endVoting();
    logEvent("L1", r.ok ? "Voting ended by admin" : `endVoting reverted: "${r.revert}"`, r.ok ? "info" : "error");
    res.json(r);
});

app.post("/api/attack/end-voting-nonadmin", async (_req, res) => {
    const r = await D.chain.endVoting({ asAttacker: true });
    logEvent("L1", r.ok ? "Non-admin ended voting (UNEXPECTED)" : `Non-admin blocked: "${r.revert}"`, r.ok ? "error" : "info");
    res.json({ ...r, expected: "Only admin" });
});

app.post("/api/attack/deploy-zero-verifier", async (_req, res) => {
    const r = await D.chain.tryDeployZeroVerifier({
        initialStateRoot: BigInt(D.stateTree.getRoot()),
        voterMerkleRoot: BigInt(D.election.voterMerkleRoot),
        electionId: D.election.electionId
    });
    logEvent("L1", r.ok ? "Zero-verifier deploy SUCCEEDED (UNEXPECTED)" : `Zero-verifier deploy blocked: "${r.revert}"`, r.ok ? "error" : "info");
    res.json({ ...r, expected: "VoteVerifier address cannot be zero" });
});

app.post("/api/attack/replay-batch", async (req, res) => {
    const idx = Number((req.body && req.body.batchIndex) ?? D.batches.length - 1);
    const target = D.batches[idx];
    if (!target) return res.status(400).json({ error: "No such batch to replay" });

    // Replay the exact calldata the chain already accepted once, including the
    // original nullifier list. The batch proof is still perfectly valid — only
    // the L1 nullifier registry stands between the attacker and a double tally.
    const cd = await D.chain.getBatchCalldata(target.txHash);
    const r = await D.chain.submitBatch({
        batchProof: cd.proof,
        newStateRoot: cd.newStateRoot,
        batchNullifierHash: cd.batchNullifierHash,
        nullifierList: target.nullifierList,
        voteProofs: [],
        spotCheckCount: 0
    });

    logEvent("L1", r.ok ? `Batch ${idx} replay SUCCEEDED (UNEXPECTED)` : `Batch ${idx} replay blocked: "${r.revert}"`, r.ok ? "error" : "info");
    res.json({
        ok: r.ok,
        revert: r.revert,
        expected: "Invalid batch state proof",
        note: "The replayed proof is still cryptographically valid in isolation. " +
              "It fails because preStateRoot is read from the contract's *current* stateRoot, " +
              "which has already advanced — so state-root chaining rejects the replay before " +
              "the nullifier registry is ever consulted. Two independent defences; the outer one fires first."
    });
});

app.post("/api/reset", async (_req, res) => {
    const addresses = await resetElection();
    res.json({ ok: true, addresses });
});

// --- helpers ----------------------------------------------------------------

/** Turn a circom witness-generation error into something an audience can read. */
function explainCircuitError(err) {
    const m = String(err && err.message ? err.message : err);
    if (/Assert Failed/i.test(m) || /Error in template/i.test(m)) {
        const line = /line:\s*(\d+)/i.exec(m);
        const tpl = /template\s+(\w+)/i.exec(m);
        return `constraint violated${tpl ? ` in ${tpl[1]}` : ""}${line ? ` (circuit line ${line[1]})` : ""} — the statement is false, so no witness exists`;
    }
    if (/Not enough values/i.test(m) || /Too many values/i.test(m)) {
        return "malformed circuit input (wrong number of signals)";
    }
    return m.slice(0, 200);
}

// --- boot -------------------------------------------------------------------

async function main() {
    requireFiles();

    console.log("=== ZKER two-layer demo server ===\n");

    D.election = await Election.load();
    D.voteVkey = JSON.parse(fs.readFileSync(PATHS.voteVkey, "utf8"));
    D.batchVkey = JSON.parse(fs.readFileSync(PATHS.batchVkey, "utf8"));

    console.log(`Election ${D.election.electionId}, ${D.election.voterCount} registered voters, ${D.election.numCandidates} candidates`);
    console.log(`Voter Merkle root ${short(D.election.voterMerkleRoot)}\n`);

    D.chain = await Chain.connect({
        network: NETWORK,
        rpcUrl: process.env.ALCHEMY_URL,
        privateKey: process.env.PRIVATE_KEY
    });

    if (NETWORK === "sepolia") {
        const eth = Number(require("ethers").formatEther(D.chain.balance));
        console.log(`Connected to Sepolia (chainId ${D.chain.chainId})`);
        console.log(`Operator account ${D.chain.adminAddress} — ${eth.toFixed(4)} ETH`);
        if (eth < 0.02) {
            console.log("\n  ⚠ Low balance. A batch costs ~0.001 ETH; a fresh 5-contract deploy ~0.02 ETH.");
            console.log("    Top up at a Sepolia faucet before demonstrating.\n");
        }
    } else {
        console.log(`Connected to ${D.chain.rpcUrl} (chainId ${D.chain.chainId})`);
    }

    await resetElection();
    console.log("");
    Object.entries(D.chain.addresses).forEach(([k, v]) =>
        console.log(`  ${k.padEnd(20)} ${v}${D.chain.explorerBase ? `  ${D.chain.addressUrl(v)}` : ""}`));

    app.listen(PORT, () => {
        console.log(`\nDemo UI:  http://localhost:${PORT}\n`);
        console.log(`Network: ${NETWORK}${NETWORK === "sepolia" ? " — every transaction gets a real Etherscan page" : ""}`);
        console.log(`Spot-check count: ${spotChecks()}`);
        console.log("Layer 1 proving runs in the browser — this server never sees a voter secret.\n");
    });
}

main().catch(err => {
    console.error("\nFatal:", err.message);
    process.exit(1);
});
