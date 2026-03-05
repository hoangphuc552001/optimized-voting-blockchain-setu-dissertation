const {ethers} = require("hardhat");

async function main() {
    const ballotBoxAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = BallotBox.attach(ballotBoxAddress);

    console.log("\n=== Starting Voting Phase ===");

    const tx = await ballotBox.startVoting();
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();

    console.log("\n=== Transaction Receipt ===");
    console.log("Block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");

    console.log("\nVoting started!");
    console.log("Voting started:", await ballotBox.votingStarted());
    console.log("Voting ended:", await ballotBox.votingEnded());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
