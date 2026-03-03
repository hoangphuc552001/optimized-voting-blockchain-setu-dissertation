const {ethers} = require("hardhat");

async function main() {
    const ballotBoxAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = BallotBox.attach(ballotBoxAddress);

    console.log("\n=== Finalizing Results ===");

    const tx = await ballotBox.finalizeResults();
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();

    console.log("\n=== Transaction Receipt ===");
    console.log("Block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");

    // Get final vote counts
    const counts = await ballotBox.getAllVoteCounts();
    console.log("\n=== Final Vote Counts ===");
    for (let i = 0; i < counts.length; i++) {
        console.log(`Candidate ${i}: ${counts[i]} votes`);
    }
    
    console.log("\nResults finalized:", await ballotBox.resultsFinalized());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
