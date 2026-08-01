'use strict';
/**
 * zk-STARK benchmark — proving time, proof size, and on-chain verification gas.
 * Run:  npx hardhat run scripts/benchmarkStark.js --network hardhat
 */

const hre = require('hardhat');
const STARK = require('../stark/stark');
const { proofToCalldata } = require('../stark/proofToCalldata');
const { ethers } = hre;

const NUM_TRIALS = 5;
const GROTH16_GAS_PER_VOTE = 90940;   // dissertation baseline
const BULLETPROOFS_GAS = 396392;      // measured earlier

async function main() {
  const SV = await ethers.getContractFactory('StarkVerifier');
  const verifier = await SV.deploy();
  await verifier.waitForDeployment();

  const VB = await ethers.getContractFactory('StarkVotingBox');
  const voting = await VB.deploy(await verifier.getAddress());
  await voting.waitForDeployment();

  console.log('StarkVerifier :', await verifier.getAddress());
  console.log('StarkVotingBox:', await voting.getAddress());
  console.log();

  // ── Proving ────────────────────────────────────────────────────────────────
  console.log(`Generating ${NUM_TRIALS} STARK proofs (T=64, blowup=8, 16 queries)…`);
  const proofs = [];
  const proveTimes = [];
  for (let i = 0; i < NUM_TRIALS; i++) {
    const secret = BigInt(1000 + i * 7);
    const t0 = performance.now();
    const proof = STARK.prove(secret);
    const dt = performance.now() - t0;
    proveTimes.push(dt);
    proofs.push(proof);
    process.stdout.write(`  [${i + 1}/${NUM_TRIALS}] secret=${secret}  ${dt.toFixed(0)} ms\n`);
  }
  const avgProveMs = proveTimes.reduce((a, b) => a + b, 0) / NUM_TRIALS;

  // ── Proof size ───────────────────────────────────────────────────────────────
  let fields = 2, hashes = 1 + proofs[0].friRoots.length; // output,final + traceRoot,friRoots
  for (const q of proofs[0].queries) {
    fields += 3;
    hashes += q.trace.proof0.length + q.trace.proofB.length + q.trace.proof2B.length;
    for (const l of q.fri) { fields += 2; hashes += l.proofA.length + l.proofB.length; }
  }
  const proofBytes = (fields + hashes) * 32;

  // ── On-chain gas ──────────────────────────────────────────────────────────────
  console.log('\nMeasuring on-chain verification gas…');
  const gasUsed = [];
  for (let i = 0; i < NUM_TRIALS; i++) {
    const cd = proofToCalldata(proofs[i]);
    const nullifier = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [BigInt(i), 1n])
    );
    const gas = await voting.castVote.estimateGas(cd, 1n, nullifier);
    gasUsed.push(Number(gas));
    process.stdout.write(`  [${i + 1}/${NUM_TRIALS}] ${gas} gas\n`);
  }
  const avgGas = gasUsed.reduce((a, b) => a + b, 0) / gasUsed.length;

  // ── Comparison ────────────────────────────────────────────────────────────────
  console.log(`\nAvg proving time : ${avgProveMs.toFixed(0)} ms`);
  console.log(`Proof size       : ${proofBytes} bytes (${(proofBytes / 1024).toFixed(1)} KB)`);
  console.log(`Avg gas per vote : ${avgGas.toFixed(0)}`);

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(' RQ4 — Empirical comparison of ZK proving systems (BN254, same machine)');
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log(' Metric         │ Groth16        │ Bulletproofs   │ zk-STARK');
  console.log('────────────────┼────────────────┼────────────────┼──────────────────');
  console.log(` Trusted setup  │ Yes (PoT)      │ No             │ No`);
  console.log(` Proving time   │ ~2 000 ms      │ ~264 ms        │ ~${avgProveMs.toFixed(0)} ms`);
  console.log(` Proof size     │ 192 B          │ 736 B          │ ${proofBytes} B (${(proofBytes/1024).toFixed(0)} KB)`);
  console.log(` On-chain gas   │ ${String(GROTH16_GAS_PER_VOTE).padEnd(14)} │ ${String(BULLETPROOFS_GAS).padEnd(14)} │ ${avgGas.toFixed(0)}`);
  console.log(` Quantum-safe   │ No             │ No             │ Yes (hash-based)`);
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log(` Gas vs Groth16 │ 1.0×           │ ${(BULLETPROOFS_GAS/GROTH16_GAS_PER_VOTE).toFixed(1)}×           │ ${(avgGas/GROTH16_GAS_PER_VOTE).toFixed(1)}×`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
