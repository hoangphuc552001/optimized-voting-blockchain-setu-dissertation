const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

/**
 * benchmarkPlonkVsGroth16.js — RQ4 empirical ZKP scheme comparison
 *
 * Benchmarks Groth16 vs PLONK on the SAME circuit (VoteProof, treeLevels=10,
 * candidates=5, ~6,179 constraints) using the SAME witness, so the comparison
 * is fair: only the proof system changes.
 *
 * Metrics collected:
 *   1. Circuit-specific setup time  (one-off, seconds)
 *   2. Proof generation time        (avg over N runs, ms) — incl. shared witness gen
 *   3. Verification time            (avg over N runs, ms)
 *   4. Proof size                   (bytes, JSON-serialised)
 *   5. Verification-key size        (bytes, JSON-serialised)
 *
 * The on-chain Solidity gas cost (metric 6) is measured separately in a Hardhat
 * test, because it requires contract deployment.
 *
 * Usage:   node scripts/benchmarkPlonkVsGroth16.js [N]
 *   N = number of timed runs per scheme (default 10). A warm-up run is always
 *       performed first and discarded to remove WASM/JIT cold-start bias.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ROOT = path.join(__dirname, "..");
const N = parseInt(process.argv[2] || "10", 10);

const R1CS = path.join(ROOT, "build", "vote_proof", "VoteProof.r1cs");
const WASM = path.join(ROOT, "build", "vote_proof", "VoteProof_js", "VoteProof.wasm");
const PTAU = path.join(ROOT, "build", "pot16_final.ptau");

// Existing Groth16 proving key (produced by the original trusted setup).
const GROTH16_ZKEY = path.join(ROOT, "build", "vote_proof_0001.zkey");

// Keys produced/used by this benchmark.
const GROTH16_FRESH_ZKEY = path.join(ROOT, "build", "bench_groth16.zkey");
const PLONK_ZKEY = path.join(ROOT, "build", "bench_plonk.zkey");
const GROTH16_VKEY = path.join(ROOT, "build", "bench_groth16_vkey.json");
const PLONK_VKEY = path.join(ROOT, "build", "bench_plonk_vkey.json");

const OUT_DIR = path.join(ROOT, "output");
const OUT_JSON = path.join(OUT_DIR, "plonk_vs_groth16.json");
const OUT_CSV = path.join(OUT_DIR, "plonk_vs_groth16.csv");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const ms = (t) => `${t.toFixed(1)} ms`;
const sec = (t) => `${(t / 1000).toFixed(2)} s`;
const bytes = (obj) => Buffer.byteLength(JSON.stringify(obj), "utf8");

function stats(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return { mean, std: Math.sqrt(variance), min: Math.min(...arr), max: Math.max(...arr) };
}

function pad(s, w) { return String(s).padEnd(w); }
function padL(s, w) { return String(s).padStart(w); }

// ---------------------------------------------------------------------------
// Build the circuit input — reuse voter #1 from the existing Merkle tree so the
// witness is real and identical for both proof systems.
// ---------------------------------------------------------------------------
async function buildInput() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const proofsData = JSON.parse(fs.readFileSync(path.join(ROOT, "merkleProofs.json"), "utf8"));
    const secretsData = JSON.parse(fs.readFileSync(path.join(ROOT, "voter-secrets.json"), "utf8"));

    const voterMerkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = BigInt(proofsData.electionId);

    const i = 0; // voter #1
    const voterProof = proofsData.proofs[i];
    const voterSecret = BigInt("0x" + secretsData.voters[i].secret);
    const nullifierHash = F.toObject(poseidon([voterSecret, electionId]));

    return {
        voterSecret: voterSecret.toString(),
        voterPathElements: voterProof.pathElements.map((e) => e.toString()),
        voterPathIndices: voterProof.pathIndices,
        nullifierHash: nullifierHash.toString(),
        candidate: "0",
        vote: "1",
        voterMerkleRoot: voterMerkleRoot.toString(),
        electionId: electionId.toString(),
    };
}

// ---------------------------------------------------------------------------
// Setup phase — time the circuit-specific setup for each scheme on the SAME ptau.
// ---------------------------------------------------------------------------
async function runSetup() {
    console.log("=== Phase 1: Circuit-specific trusted setup (timed once) ===");

    // Groth16 phase-2 setup (newZKey). The original ceremony also added a
    // contribution; here we time the dominant phase-2 step for an apples-to-apples
    // comparison against PLONK's single setup call.
    let t0 = performance.now();
    await snarkjs.zKey.newZKey(R1CS, PTAU, GROTH16_FRESH_ZKEY);
    const groth16SetupMs = performance.now() - t0;
    await snarkjs.zKey.exportVerificationKey(GROTH16_FRESH_ZKEY).then((vk) =>
        fs.writeFileSync(GROTH16_VKEY, JSON.stringify(vk, null, 2))
    );
    console.log(`  Groth16 setup: ${sec(groth16SetupMs)}`);

    // PLONK setup — universal, no per-circuit phase-2 contribution required.
    t0 = performance.now();
    await snarkjs.plonk.setup(R1CS, PTAU, PLONK_ZKEY);
    const plonkSetupMs = performance.now() - t0;
    await snarkjs.zKey.exportVerificationKey(PLONK_ZKEY).then((vk) =>
        fs.writeFileSync(PLONK_VKEY, JSON.stringify(vk, null, 2))
    );
    console.log(`  PLONK setup:   ${sec(plonkSetupMs)}\n`);

    return { groth16SetupMs, plonkSetupMs };
}

// ---------------------------------------------------------------------------
// Proving + verification benchmark for one scheme.
// ---------------------------------------------------------------------------
async function benchScheme(name, prover, verifier, zkeyPath, vkeyPath, input) {
    console.log(`=== Benchmarking ${name} (${N} runs + 1 warm-up) ===`);
    const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

    // Warm-up (discarded) — removes WASM compile / JIT cold-start bias.
    const warm = await prover(input, WASM, zkeyPath);

    const proveTimes = [];
    const verifyTimes = [];
    let lastProof = warm.proof;
    let lastPublic = warm.publicSignals;

    for (let r = 0; r < N; r++) {
        let t0 = performance.now();
        const { proof, publicSignals } = await prover(input, WASM, zkeyPath);
        proveTimes.push(performance.now() - t0);

        t0 = performance.now();
        const ok = await verifier(vKey, publicSignals, proof);
        verifyTimes.push(performance.now() - t0);
        if (!ok) throw new Error(`${name} proof failed to verify on run ${r}`);

        lastProof = proof;
        lastPublic = publicSignals;
        process.stdout.write(`  run ${r + 1}/${N}\r`);
    }

    const proofSize = bytes(lastProof);
    const vkeySize = bytes(vKey);
    const ps = stats(proveTimes);
    const vs = stats(verifyTimes);

    console.log(
        `  prove: ${ms(ps.mean)} ±${ps.std.toFixed(1)}  |  ` +
        `verify: ${ms(vs.mean)} ±${vs.std.toFixed(1)}  |  ` +
        `proof: ${proofSize} B  |  vkey: ${vkeySize} B\n`
    );

    return {
        scheme: name,
        proveMeanMs: ps.mean, proveStdMs: ps.std, proveMinMs: ps.min, proveMaxMs: ps.max,
        verifyMeanMs: vs.mean, verifyStdMs: vs.std,
        proofSizeBytes: proofSize, vkeySizeBytes: vkeySize,
        verified: true,
    };
}

// ---------------------------------------------------------------------------
// Pretty comparison table + winners.
// ---------------------------------------------------------------------------
function printTable(setup, g, p, meta) {
    const rows = [
        ["Constraints (R1CS)", meta.constraints, meta.constraints, "— (same circuit)"],
        ["Setup time", sec(setup.groth16SetupMs), sec(setup.plonkSetupMs),
            setup.groth16SetupMs <= setup.plonkSetupMs ? "Groth16" : "PLONK"],
        ["Proof generation (avg)", ms(g.proveMeanMs), ms(p.proveMeanMs),
            g.proveMeanMs <= p.proveMeanMs ? "Groth16" : "PLONK"],
        ["Verification time (avg)", ms(g.verifyMeanMs), ms(p.verifyMeanMs),
            g.verifyMeanMs <= p.verifyMeanMs ? "Groth16" : "PLONK"],
        ["Proof size", `${g.proofSizeBytes} B`, `${p.proofSizeBytes} B`,
            g.proofSizeBytes <= p.proofSizeBytes ? "Groth16" : "PLONK"],
        ["Verification key size", `${g.vkeySizeBytes} B`, `${p.vkeySizeBytes} B`,
            g.vkeySizeBytes <= p.vkeySizeBytes ? "Groth16" : "PLONK"],
    ];

    const W = [26, 16, 16, 18];
    const line = "+" + W.map((w) => "-".repeat(w + 2)).join("+") + "+";
    console.log("=== RESULTS: Groth16 vs PLONK ===\n");
    console.log(line);
    console.log("| " + pad("Metric", W[0]) + " | " + padL("Groth16", W[1]) +
        " | " + padL("PLONK", W[2]) + " | " + pad("Better", W[3]) + " |");
    console.log(line);
    for (const [m, gv, pv, b] of rows) {
        console.log("| " + pad(m, W[0]) + " | " + padL(gv, W[1]) +
            " | " + padL(pv, W[2]) + " | " + pad(b, W[3]) + " |");
    }
    console.log(line);
    console.log("\nNote: proof generation time includes witness generation, which uses");
    console.log("the same .wasm for both schemes and is therefore identical overhead.");
    console.log("Sizes are JSON-serialised (larger than the raw binary encoding).\n");
}

function writeOutputs(setup, g, p, meta) {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const result = {
        generatedAt: new Date().toISOString(),
        circuit: "VoteProof(treeLevels=10, candidates=5)",
        constraints: meta.constraints,
        runs: N,
        ptau: path.basename(PTAU),
        groth16: { setupMs: setup.groth16SetupMs, ...g },
        plonk: { setupMs: setup.plonkSetupMs, ...p },
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));

    const csv = [
        "metric,groth16,plonk,unit",
        `setup_time,${(setup.groth16SetupMs / 1000).toFixed(3)},${(setup.plonkSetupMs / 1000).toFixed(3)},s`,
        `proof_generation,${g.proveMeanMs.toFixed(2)},${p.proveMeanMs.toFixed(2)},ms`,
        `proof_generation_std,${g.proveStdMs.toFixed(2)},${p.proveStdMs.toFixed(2)},ms`,
        `verification_time,${g.verifyMeanMs.toFixed(3)},${p.verifyMeanMs.toFixed(3)},ms`,
        `proof_size,${g.proofSizeBytes},${p.proofSizeBytes},bytes`,
        `vkey_size,${g.vkeySizeBytes},${p.vkeySizeBytes},bytes`,
        `constraints,${meta.constraints},${meta.constraints},count`,
    ].join("\n");
    fs.writeFileSync(OUT_CSV, csv);

    console.log(`Saved: ${path.relative(ROOT, OUT_JSON)}`);
    console.log(`Saved: ${path.relative(ROOT, OUT_CSV)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    for (const f of [R1CS, WASM, PTAU]) {
        if (!fs.existsSync(f)) {
            console.error(`Missing required artifact: ${f}`);
            console.error("Compile the circuit and ensure pot16_final.ptau exists first.");
            process.exit(1);
        }
    }

    console.log(`\nZKP scheme benchmark — Groth16 vs PLONK`);
    console.log(`Circuit: VoteProof(treeLevels=10, candidates=5)`);
    console.log(`Timed runs per scheme: ${N}\n`);

    const info = await snarkjs.r1cs.info(R1CS);
    const meta = { constraints: info.nConstraints };

    const setup = await runSetup();
    const input = await buildInput();

    const g = await benchScheme(
        "Groth16", snarkjs.groth16.fullProve, snarkjs.groth16.verify,
        GROTH16_FRESH_ZKEY, GROTH16_VKEY, input
    );
    const p = await benchScheme(
        "PLONK", snarkjs.plonk.fullProve, snarkjs.plonk.verify,
        PLONK_ZKEY, PLONK_VKEY, input
    );

    printTable(setup, g, p, meta);
    writeOutputs(setup, g, p, meta);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("\nBenchmark error:", err);
        process.exit(1);
    });
