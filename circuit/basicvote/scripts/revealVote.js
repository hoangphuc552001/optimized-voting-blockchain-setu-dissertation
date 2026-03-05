const {ethers} = require("hardhat");
const fs = require("fs");

async function main() {
    const proofData = JSON.parse(fs.readFileSync("./proof.json", "utf8"));
    
    const ballotBoxAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = BallotBox.attach(ballotBoxAddress);

    console.log("\n=== Revealing Vote ===");
    console.log("Voter:", proofData.voter);
    console.log("Candidate:", proofData.candidate);
    console.log("Vote:", proofData.vote);
    console.log("Salt:", proofData.salt);
    console.log("Nullifier Hash:", proofData.nullifierHash);

    // Call revealVote with the voter's data
    // Note: In a real system, this should only be callable by the voter
    // For demo purposes, anyone can reveal
    const tx = await ballotBox.revealVote(
        proofData.nullifierHash,  // nullifierHash
        proofData.candidate,       // candidate
        proofData.vote,            // vote
        proofData.salt             // salt
    );
    
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();

    console.log("\n=== Transaction Receipt ===");
    console.log("Block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    
    // Get vote counts
    const counts = await ballotBox.getAllVoteCounts();
    console.log("\n=== Current Vote Counts ===");
    for (let i = 0; i < counts.length; i++) {
        console.log(`Candidate ${i}: ${counts[i]} votes`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
