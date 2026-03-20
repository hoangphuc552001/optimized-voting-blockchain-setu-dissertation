const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * submitTwoLayerBatch.js — Submit a two-layer batch proof to VotingRollupV2
 *
 * Submits:
 * 1. The batch state transition proof (Layer 2)
 * 2. Individual vote proofs for on-chain spot-checking (Layer 1)
 * 3. Nullifier list for L1 duplicate prevention
 */

async function main() {
    const network = hre.network.name;
    console.log(`\n=== Submitting Two-Layer Batch to ${network} ===`);

    // Load V2 addresses
    const addressesFile = path.join(__dirname, "..", `${network}-v2-addresses.json`);
    if (!fs.existsSync(addressesFile)) {
        console.error(`Error: ${addressesFile} not found. Run deployTwoLayer.js first.`);
        process.exit(1);
    }
    const addresses = JSON.parse(fs.readFileSync(addressesFile, "utf8"));

    // Load batch state proof (Layer 2)
    const batchProofPath = path.join(__dirname, "..", "build", "batch_state_proof.json");
    const batchPublicPath = path.join(__dirname, "..", "build", "batch_state_public.json");
    if (!fs.existsSync(batchProofPath) || !fs.existsSync(batchPublicPath)) {
        console.error("Error: Batch state proof not found. Generate it first.");
        process.exit(1);
    }
    const batchProof = JSON.parse(fs.readFileSync(batchProofPath, "utf8"));
    const batchPublicSignals = JSON.parse(fs.readFileSync(batchPublicPath, "utf8"));

    // Load individual vote proofs (Layer 1)
    const voteProofsPath = path.join(__dirname, "..", "build", "vote_proofs.json");
    if (!fs.existsSync(voteProofsPath)) {
        console.error("Error: vote_proofs.json not found. Run generateVoteProof.js first.");
        process.exit(1);
    }
    const voteProofs = JSON.parse(fs.readFileSync(voteProofsPath, "utf8"));

    console.log("\n--- Batch Proof (Layer 2) ---");
    console.log("Public signals:", batchPublicSignals.length);
    console.log("Pre-state root:", batchPublicSignals[0].substring(0, 30) + "...");
    console.log("Post-state root:", batchPublicSignals[1].substring(0, 30) + "...");

    console.log("\n--- Individual Vote Proofs (Layer 1) ---");
    console.log("Total proofs:", voteProofs.length);
    console.log("Spot-check count:", addresses.spotCheckCount);

    // Get contract
    const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
    const rollup = await VotingRollupV2.attach(addresses.votingRollupV2);

    const [signer] = await ethers.getSigners();
    console.log("\nSubmitting from:", signer.address);

    // Check current state
    const state = await rollup.getState();
    console.log("\nCurrent contract state:");
    console.log("- State root:", state._stateRoot.toString().substring(0, 30) + "...");
    console.log("- Batch count:", state._batchCount.toString());
    console.log("- Voting active:", state._votingActive);

    // Format batch proof (Layer 2) — swap pi_b inner pairs for EVM
    const batchA = batchProof.pi_a.slice(0, 2);
    const batchB = [
        [batchProof.pi_b[0][1], batchProof.pi_b[0][0]],
        [batchProof.pi_b[1][1], batchProof.pi_b[1][0]]
    ];
    const batchC = batchProof.pi_c.slice(0, 2);

    const newStateRoot = BigInt(batchPublicSignals[1]);
    const batchNullifierHash = BigInt(batchPublicSignals[2]);

    // Extract nullifier list from vote proofs
    const nullifierList = voteProofs
        .filter(vp => vp.vote > 0)
        .map(vp => BigInt(vp.nullifierHash));

    // Format individual vote proofs for spot-checking (Layer 1)
    const spotCount = Math.min(addresses.spotCheckCount, voteProofs.length);
    const voteProofsA = [];
    const voteProofsB = [];
    const voteProofsC = [];
    const votePublicSignals = [];

    for (let i = 0; i < spotCount; i++) {
        const vp = voteProofs[i];
        voteProofsA.push(vp.proof.pi_a.slice(0, 2));
        voteProofsB.push([
            [vp.proof.pi_b[0][1], vp.proof.pi_b[0][0]],
            [vp.proof.pi_b[1][1], vp.proof.pi_b[1][0]]
        ]);
        voteProofsC.push(vp.proof.pi_c.slice(0, 2));
        votePublicSignals.push(vp.publicSignals);
    }

    console.log("\n--- Submission Details ---");
    console.log("Nullifiers:", nullifierList.length);
    console.log("Spot-checks:", spotCount);

    // Submit
    console.log("\nSubmitting batch...");
    const tx = await rollup.submitBatch(
        batchA,
        batchB,
        batchC,
        newStateRoot,
        batchNullifierHash,
        nullifierList,
        voteProofsA,
        voteProofsB,
        voteProofsC,
        votePublicSignals
    );

    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();

    console.log("\n=== Batch Submitted Successfully ===");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    // Verify new state
    const newState = await rollup.getState();
    console.log("\nNew contract state:");
    console.log("- New state root:", newState._stateRoot.toString().substring(0, 30) + "...");
    console.log("- Total batches:", newState._batchCount.toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
