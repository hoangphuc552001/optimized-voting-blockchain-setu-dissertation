const {ethers} = require("hardhat");

async function main() {
    const ballotBoxAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = BallotBox.attach(ballotBoxAddress);

    console.log("\n=== Ending Voting Phase ===");

    const tx = await ballotBox.endVoting();
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();

    console.log("\n=== Transaction Receipt ===");
    console.log("Block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");

    console.log("\nVoting ended!");
    console.log("Voting ended:", await ballotBox.votingEnded());
    console.log("Voting started:", await ballotBox.votingStarted());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
