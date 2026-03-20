const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * getTallyV2.js — Get election tally from VotingRollupV2 (Two-Layer)
 *
 * Reads the vote counts from the batch state input and displays the tally.
 * Also queries on-chain state and optionally ends voting.
 */

async function main() {
    const network = hre.network.name;
    console.log(`\n=== Getting Election Tally — V2 Two-Layer (${network}) ===`);

    // Load V2 addresses
    const addressesFile = path.join(__dirname, "..", `${network}-v2-addresses.json`);
    if (!fs.existsSync(addressesFile)) {
        console.error(`Error: ${addressesFile} not found. Run deployTwoLayer.js first.`);
        process.exit(1);
    }
    const addresses = JSON.parse(fs.readFileSync(addressesFile, "utf8"));

    // Get contract
    const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
    const rollup = await VotingRollupV2.attach(addresses.votingRollupV2);

    // Get current on-chain state
    const state = await rollup.getState();
    console.log("\n=== On-Chain State ===");
    console.log(`- Election ID: ${state._electionId}`);
    console.log(`- State Root: ${state._stateRoot.toString().substring(0, 40)}...`);
    console.log(`- Voter Merkle Root: ${state._voterMerkleRoot.toString().substring(0, 40)}...`);
    console.log(`- Batch Count: ${state._batchCount}`);
    console.log(`- Voting Active: ${state._votingActive}`);

    // Calculate tally from batch state input
    const batchInputPath = path.join(__dirname, "..", "build", "batch_state_input.json");
    if (fs.existsSync(batchInputPath)) {
        const batchInput = JSON.parse(fs.readFileSync(batchInputPath, "utf8"));

        const voteCounts = {};
        const candidates = batchInput.candidates;
        const votes = batchInput.votes;
        const isNoOps = batchInput.isNoOp;

        for (let i = 0; i < candidates.length; i++) {
            if (isNoOps[i] === "1") continue; // Skip padding
            const candidate = candidates[i];
            const vote = parseInt(votes[i]);
            voteCounts[candidate] = (voteCounts[candidate] || 0) + vote;
        }

        console.log("\n=== Vote Tally ===");
        const sortedCandidates = Object.keys(voteCounts).sort((a, b) => a - b);
        for (const candidate of sortedCandidates) {
            const bar = "█".repeat(voteCounts[candidate]);
            console.log(`  Candidate ${candidate}: ${voteCounts[candidate]} votes ${bar}`);
        }
        const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
        console.log(`\n  Total votes: ${totalVotes}`);
        console.log(`  Post-state root: ${batchInput.postStateRoot.substring(0, 40)}...`);
    } else {
        console.log("\nWarning: batch_state_input.json not found. Cannot calculate tally.");
    }

    // Also check individual vote proofs for breakdown
    const voteProofsPath = path.join(__dirname, "..", "build", "vote_proofs.json");
    if (fs.existsSync(voteProofsPath)) {
        const voteProofs = JSON.parse(fs.readFileSync(voteProofsPath, "utf8"));
        console.log(`\n=== Individual Vote Proofs: ${voteProofs.length} ===`);
        voteProofs.forEach((vp, i) => {
            console.log(`  Vote ${i + 1}: candidate=${vp.candidate}, vote=${vp.vote}, nullifier=${vp.nullifierHash.substring(0, 20)}...`);
        });
    }

    // End voting if requested (uncomment to auto-end)
    if (state._votingActive) {
        console.log("\n=== Ending Voting ===");
        const [signer] = await ethers.getSigners();
        const tx = await rollup.connect(signer).endVoting();
        await tx.wait();
        console.log(`Voting ended. Tx: ${tx.hash}`);

        const finalState = await rollup.getState();
        console.log(`- Voting Active: ${finalState._votingActive}`);
        console.log(`- Final State Root: ${finalState._stateRoot.toString().substring(0, 40)}...`);
        console.log(`- Total Batches: ${finalState._batchCount}`);
    } else {
        console.log("\nVoting has already ended.");
    }

    console.log("\n=== Tally Complete ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
