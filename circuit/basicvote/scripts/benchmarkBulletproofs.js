'use strict';
/**
 * Bulletproofs benchmark — measures proving time, verification gas, and proof size.
 * Compares against the Groth16 baseline recorded in the dissertation.
 *
 * Run with:  npx hardhat run scripts/benchmarkBulletproofs.js --network hardhat
 */

const hre = require('hardhat');
const { prove } = require('../bulletproofs/rangeProof');
const { proofToCalldata } = require('../bulletproofs/proofToCalldata');
const { ethers } = hre;

const NUM_TRIALS = 5;
const CANDIDATES = [0, 1, 2, 3, 4];

// Groth16 baseline from dissertation measurements (gas per vote, batch=1)
const GROTH16_GAS_PER_VOTE = 90940;

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('Deploying BPVerifier and BPVotingBox…');

  const BPVerifier  = await ethers.getContractFactory('BPVerifier');
  const verifier    = await BPVerifier.deploy();
  await verifier.waitForDeployment();

  const BPVotingBox = await ethers.getContractFactory('BPVotingBox');
  const voting      = await BPVotingBox.deploy(await verifier.getAddress());
  await voting.waitForDeployment();

  console.log('BPVerifier  :', await verifier.getAddress());
  console.log('BPVotingBox :', await voting.getAddress());
  console.log();

  // ── Prove phase ──────────────────────────────────────────────────────────────
  console.log(`Generating ${NUM_TRIALS} proofs (n=4 bits)…`);
  const proofs = [];
  const proveTimes = [];

  for (let i = 0; i < NUM_TRIALS; i++) {
    const v = BigInt(CANDIDATES[i % CANDIDATES.length]);
    const t0 = performance.now();
    const proof = prove(v, null, 4);
    const dt = performance.now() - t0;
    proveTimes.push(dt);
    proofs.push(proof);
    process.stdout.write(`  [${i+1}/${NUM_TRIALS}] v=${v}  ${dt.toFixed(0)} ms\n`);
  }

  const avgProveMs = proveTimes.reduce((a,b)=>a+b,0) / NUM_TRIALS;
  console.log(`\nAvg proving time: ${avgProveMs.toFixed(0)} ms`);

  // ── Proof size ────────────────────────────────────────────────────────────────
  // uint256[23] = 23 * 32 = 736 bytes
  const proofBytes = 23 * 32;
  console.log(`Proof size      : ${proofBytes} bytes`);

  // ── On-chain gas measurement ──────────────────────────────────────────────────
  console.log('\nMeasuring on-chain gas…');
  const gasUsed = [];

  for (let i = 0; i < NUM_TRIALS; i++) {
    const calldata = proofToCalldata(proofs[i]);
    const candidate = BigInt(CANDIDATES[i % CANDIDATES.length]);
    const nullifier = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256','uint256'], [BigInt(i), 1n]
      )
    );

    // Estimate gas with ethers (calls verify)
    const gas = await voting.castVote.estimateGas(calldata, candidate, nullifier);
    gasUsed.push(Number(gas));
    process.stdout.write(`  [${i+1}/${NUM_TRIALS}] ${gas} gas\n`);
  }

  const avgGas = gasUsed.reduce((a,b)=>a+b,0) / gasUsed.length;
  console.log(`\nAvg gas per vote: ${avgGas.toFixed(0)}`);

  // ── Comparison table ──────────────────────────────────────────────────────────
  const overhead = ((avgGas / GROTH16_GAS_PER_VOTE - 1) * 100).toFixed(1);
  const sign = avgGas > GROTH16_GAS_PER_VOTE ? '+' : '';

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(' RQ4 Benchmark Comparison');
  console.log('══════════════════════════════════════════════════════════');
  console.log(` Metric            │ Groth16          │ Bulletproofs`);
  console.log(`───────────────────┼──────────────────┼─────────────────`);
  console.log(` Proving time      │ ~2 000 ms        │ ~${avgProveMs.toFixed(0)} ms`);
  console.log(` Proof size        │ 192 bytes        │ ${proofBytes} bytes`);
  console.log(` On-chain gas      │ ${GROTH16_GAS_PER_VOTE.toLocaleString()} gas    │ ${avgGas.toFixed(0)} gas`);
  console.log(` Trusted setup     │ Yes (Powers of Tau) │ No`);
  console.log(` Overhead vs G16   │ —                │ ${sign}${overhead}%`);
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
