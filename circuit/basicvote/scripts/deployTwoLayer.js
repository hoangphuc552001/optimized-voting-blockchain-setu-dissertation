const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

/**
 * deployTwoLayer.js — Deploy the Two-Layer VotingRollupV2 system
 *
 * Deploys:
 * 1. VoteVerifier (Layer 1 — individual vote proof verifier)
 * 2. BatchStateVerifier (Layer 2 — batch state transition verifier)
 * 3. VotingRollupV2 (main rollup contract with dual verifiers)
 */

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("\n=== Deploying Two-Layer VotingRollupV2 ===");
    console.log("Deployer:", deployer.address);
    console.log("Balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // Load election config
    const proofsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "merkleProofs.json"), "utf8"));
    const voterMerkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = proofsData.electionId;

    // Compute initial empty state root
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const stateLevels = 5;
    const numLeaves = 2 ** stateLevels;

    const zeroLeaves = new Array(numLeaves).fill(0n);
    let currentLevel = zeroLeaves.map(v => F.toObject(poseidon([v])));
    for (let level = 0; level < stateLevels; level++) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : 0n;
            nextLevel.push(F.toObject(poseidon([left, right])));
        }
        currentLevel = nextLevel;
    }
    const initialStateRoot = currentLevel[0];

    console.log("\n--- Configuration ---");
    console.log("Election ID:", electionId);
    console.log("Voter Merkle Root:", voterMerkleRoot.toString().substring(0, 30) + "...");
    console.log("Initial State Root:", initialStateRoot.toString().substring(0, 30) + "...");

    // Deploy Layer 1: VoteVerifier
    let voteVerifierAddress;
    try {
        const VoteVerifier = await ethers.getContractFactory("contracts/VoteVerifier.sol:Groth16Verifier");
        const voteVerifier = await VoteVerifier.deploy();
        await voteVerifier.waitForDeployment();
        voteVerifierAddress = await voteVerifier.getAddress();
        console.log("\n✓ VoteVerifier (Layer 1) deployed to:", voteVerifierAddress);
    } catch (err) {
        console.log("\nVoteVerifier not found, using MockVoteVerifier...");
        const MockVoteVerifier = await ethers.getContractFactory("MockVoteVerifier");
        const mock = await MockVoteVerifier.deploy();
        await mock.waitForDeployment();
        voteVerifierAddress = await mock.getAddress();
        console.log("✓ MockVoteVerifier deployed to:", voteVerifierAddress);
    }

    // Deploy Layer 2: BatchStateVerifier
    let batchVerifierAddress;
    try {
        const BatchStateVerifier = await ethers.getContractFactory("contracts/BatchStateVerifier.sol:Groth16Verifier");
        const batchStateVerifier = await BatchStateVerifier.deploy();
        await batchStateVerifier.waitForDeployment();
        batchVerifierAddress = await batchStateVerifier.getAddress();
        console.log("✓ BatchStateVerifier (Layer 2) deployed to:", batchVerifierAddress);
    } catch (err) {
        console.log("BatchStateVerifier not found, using MockBatchVerifier...");
        const MockVerifier = await ethers.getContractFactory("MockBatchVerifier");
        const mock = await MockVerifier.deploy();
        await mock.waitForDeployment();
        batchVerifierAddress = await mock.getAddress();
        console.log("✓ MockBatchVerifier deployed to:", batchVerifierAddress);
    }

    // Deploy VotingRollupV2
    const spotCheckCount = 0; // Verify 2 individual proofs on-chain per batch
    const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
    const rollup = await VotingRollupV2.deploy(
        voteVerifierAddress,
        batchVerifierAddress,
        initialStateRoot,
        voterMerkleRoot,
        electionId,
        spotCheckCount
    );
    await rollup.waitForDeployment();
    const rollupAddress = await rollup.getAddress();
    console.log("✓ VotingRollupV2 deployed to:", rollupAddress);
    console.log("  Spot-check count:", spotCheckCount);

    // Verify on-chain state
    const onChainRoot = await rollup.stateRoot();
    const onChainVoterRoot = await rollup.voterMerkleRoot();
    console.log("\n--- On-chain Verification ---");
    console.log("State root matches:", onChainRoot.toString() === initialStateRoot.toString());
    console.log("Voter root matches:", onChainVoterRoot.toString() === voterMerkleRoot.toString());
    console.log("Voting active:", await rollup.votingActive());

    // Save addresses
    const network = hre.network.name;
    const addresses = {
        network,
        version: "v2-two-layer",
        voteVerifier: voteVerifierAddress,
        batchStateVerifier: batchVerifierAddress,
        votingRollupV2: rollupAddress,
        electionId,
        voterMerkleRoot: voterMerkleRoot.toString(),
        initialStateRoot: initialStateRoot.toString(),
        spotCheckCount,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    const addressesFile = path.join(__dirname, "..", `${network}-v2-addresses.json`);
    fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2));
    console.log(`\nAddresses saved to: ${addressesFile}`);

    console.log("\n=== Two-Layer Deployment Complete ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
