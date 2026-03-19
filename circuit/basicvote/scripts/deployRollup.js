const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("\nDeploying ZK Rollup contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    const proofsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "merkleProofs.json"), "utf8"));
    const voterMerkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = proofsData.electionId;

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

    console.log("\n=== Rollup Configuration ===");
    console.log("Election ID:", electionId);
    console.log("Voter Merkle Root:", voterMerkleRoot.toString());
    console.log("Initial State Root:", initialStateRoot.toString());

    let verifierAddress;
    try {
        const BatchVerifier = await ethers.getContractFactory("contracts/BatchVerifier.sol:Groth16Verifier");
        const batchVerifier = await BatchVerifier.deploy();
        await batchVerifier.waitForDeployment();
        verifierAddress = await batchVerifier.getAddress();
        console.log("\nBatchVerifier deployed to:", verifierAddress);
    } catch {
        console.log("\nBatchVerifier not found, deploying MockBatchVerifier...");
        const MockVerifier = await ethers.getContractFactory("MockBatchVerifier");
        const mockVerifier = await MockVerifier.deploy();
        await mockVerifier.waitForDeployment();
        verifierAddress = await mockVerifier.getAddress();
        console.log("MockBatchVerifier deployed to:", verifierAddress);
    }

    const VotingRollup = await ethers.getContractFactory("VotingRollup");
    const votingRollup = await VotingRollup.deploy(
        verifierAddress,
        initialStateRoot,
        voterMerkleRoot,
        electionId
    );
    await votingRollup.waitForDeployment();
    const rollupAddress = await votingRollup.getAddress();
    console.log("VotingRollup deployed to:", rollupAddress);

    const onChainRoot = await votingRollup.stateRoot();
    const onChainVoterRoot = await votingRollup.voterMerkleRoot();
    console.log("\n=== On-chain Verification ===");
    console.log("State root matches:", onChainRoot.toString() === initialStateRoot.toString());
    console.log("Voter root matches:", onChainVoterRoot.toString() === voterMerkleRoot.toString());
    console.log("Voting active:", await votingRollup.votingActive());

    const network = hre.network.name;
    const addresses = {
        network,
        batchVerifier: verifierAddress,
        votingRollup: rollupAddress,
        electionId,
        voterMerkleRoot: voterMerkleRoot.toString(),
        initialStateRoot: initialStateRoot.toString(),
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    const addressesFile = path.join(__dirname, "..", `${network}-rollup-addresses.json`);
    fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2));
    console.log(`\nAddresses saved to: ${addressesFile}`);

    console.log("\n=== Deployment Complete ===");
    console.log("Verifier:", verifierAddress);
    console.log("VotingRollup:", rollupAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
