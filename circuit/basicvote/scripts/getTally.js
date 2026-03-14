const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const network = hre.network.name;
    console.log(`\n=== Getting Election Tally (${network}) ===`);

    // Load rollup addresses
    const addressesFile = path.join(__dirname, "..", `${network}-rollup-addresses.json`);
    if (!fs.existsSync(addressesFile)) {
        console.error(`Error: ${addressesFile} not found.`);
        process.exit(1);
    }
    const addresses = JSON.parse(fs.readFileSync(addressesFile, "utf8"));
    const rollupAddress = addresses.votingRollup;

    // Get contract
    const VotingRollup = await ethers.getContractFactory("VotingRollup");
    const votingRollup = await VotingRollup.attach(rollupAddress);

    // Get current state
    const state = await votingRollup.getState();
    console.log("\n=== Contract State ===");
    console.log(`- Election ID: ${state._electionId}`);
    console.log(`- State Root: ${state._stateRoot.toString()}`);
    console.log(`- Voter Merkle Root: ${state._voterMerkleRoot.toString()}`);
    console.log(`- Batch Count: ${state._batchCount}`);
    console.log(`- Voting Active: ${state._votingActive}`);

    // Load batch input to calculate tally
    const batchInputPath = path.join(__dirname, "..", "batch_input.json");
    if (fs.existsSync(batchInputPath)) {
        const batchInput = JSON.parse(fs.readFileSync(batchInputPath, "utf8"));

        // Calculate vote counts per candidate
        const voteCounts = {};
        const candidates = batchInput.candidates;
        const votes = batchInput.votes;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const vote = parseInt(votes[i]);
            voteCounts[candidate] = (voteCounts[candidate] || 0) + vote;
        }

        console.log("\n=== Vote Tally (from batch input) ===");
        const sortedCandidates = Object.keys(voteCounts).sort((a, b) => a - b);
        for (const candidate of sortedCandidates) {
            console.log(`- Candidate ${candidate}: ${voteCounts[candidate]} votes`);
        }
        console.log(`\nTotal votes: ${Object.values(voteCounts).reduce((a, b) => a + b, 0)}`);

        // Show post-state root
        console.log("\n=== Final State ===");
        console.log(`Post-state root: ${batchInput.postStateRoot}`);
    } else {
        console.log("\nWarning: batch_input.json not found. Cannot calculate tally.");
    }

    // End voting if still active
    if (state._votingActive) {
        console.log("\n=== Ending Voting ===");
        const [signer] = await ethers.getSigners();
        const tx = await votingRollup.connect(signer).endVoting();
        const receipt = await tx.wait();
        console.log(`Voting ended. Transaction: ${tx.hash}`);

        // Get final state
        const finalState = await votingRollup.getState();
        console.log("\n=== Final Contract State ===");
        console.log(`- Voting Active: ${finalState._votingActive}`);
        console.log(`- Final State Root: ${finalState._stateRoot.toString()}`);
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
