const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const network = hre.network.name;
    console.log(`\n=== Submitting Batch Proof to ${network} ===`);

    // Load rollup addresses
    const addressesFile = path.join(__dirname, "..", `${network}-rollup-addresses.json`);
    if (!fs.existsSync(addressesFile)) {
        console.error(`Error: ${addressesFile} not found. Run deployRollup.js first.`);
        process.exit(1);
    }
    const addresses = JSON.parse(fs.readFileSync(addressesFile, "utf8"));
    const rollupAddress = addresses.votingRollup;

    // Load batch proof
    const proofPath = path.join(__dirname, "..", "build", "batch_proof.json");
    const publicPath = path.join(__dirname, "..", "build", "batch_public.json");

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
        console.error("Error: Proof files not found. Generate proof first.");
        process.exit(1);
    }

    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));

    console.log("\nBatch Proof loaded:");
    console.log("- Public signals:", publicSignals.length);

    // Get contract
    const VotingRollup = await ethers.getContractFactory("VotingRollup");
    const votingRollup = await VotingRollup.attach(rollupAddress);

    // Parse proof components
    const a = proof.pi_a.slice(0, 2);
    const b = proof.pi_b.flat().slice(0, 8);
    const b0 = [b.slice(0, 4), b.slice(4, 8)];
    const bFormatted = [
        [b0[0][0], b0[0][1]],
        [b0[0][2], b0[0][3]],
        [b0[1][0], b0[1][1]],
        [b0[1][2], b0[1][3]]
    ];
    const bCorrect = [
        [proof.pi_b[0][0], proof.pi_b[0][1]],
        [proof.pi_b[1][0], proof.pi_b[1][1]]
    ];
    const c = proof.pi_c.slice(0, 2);

    // Public inputs: [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]
    const preStateRoot = BigInt(publicSignals[0]);
    const postStateRoot = BigInt(publicSignals[1]);
    const batchNullifierHash = BigInt(publicSignals[2]);
    const voterMerkleRoot = BigInt(publicSignals[3]);

    console.log("\nPublic Inputs:");
    console.log("- Pre-state root:", preStateRoot.toString().substring(0, 30) + "...");
    console.log("- Post-state root:", postStateRoot.toString().substring(0, 30) + "...");
    console.log("- Batch nullifier hash:", batchNullifierHash.toString().substring(0, 30) + "...");
    console.log("- Voter merkle root:", voterMerkleRoot.toString().substring(0, 30) + "...");

    // Get signers
    const [signer] = await ethers.getSigners();
    console.log("\nSubmitting from:", signer.address);

    // Check current state
    const state = await votingRollup.getState();
    console.log("\nCurrent contract state:");
    console.log("- State root:", state._stateRoot.toString().substring(0, 30) + "...");
    console.log("- Batch count:", state._batchCount.toString());
    console.log("- Voting active:", state._votingActive);

    // Prepare nullifier list (from batch input)
    const batchInputPath = path.join(__dirname, "..", "batch_input.json");
    if (fs.existsSync(batchInputPath)) {
        const batchInput = JSON.parse(fs.readFileSync(batchInputPath, "utf8"));
        const nullifierList = batchInput.nullifierHashes.map(n => BigInt(n));

        console.log("- Nullifiers in batch:", nullifierList.length);

        // Submit batch
        console.log("\nSubmitting batch...");
        const tx = await votingRollup.submitBatch(
            a,
            bCorrect,
            c,
            postStateRoot,
            batchNullifierHash,
            nullifierList
        );

        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();

        console.log("\n=== Batch Submitted Successfully ===");
        console.log("Block number:", receipt.blockNumber);
        console.log("Gas used:", receipt.gasUsed.toString());

        // Verify new state
        const newState = await votingRollup.getState();
        console.log("\nNew contract state:");
        console.log("- New state root:", newState._stateRoot.toString().substring(0, 30) + "...");
        console.log("- Total batches:", newState._batchCount.toString());
    } else {
        console.error("Error: batch_input.json not found. Cannot get nullifier list.");
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
