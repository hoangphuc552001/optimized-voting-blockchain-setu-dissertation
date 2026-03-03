const {ethers} = require("hardhat");
const fs = require("fs");

async function main() {
    const proofData = JSON.parse(fs.readFileSync("./proof.json", "utf8"));
    const proof = proofData.proof;
    const ballotHash = proofData.ballotHash;

    console.log("\n=== Submitting Ballot to Blockchain ===");
    console.log("Voter:", proofData.voter);
    console.log("Ballot Hash:", ballotHash);

    const ballotBoxAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

    // Format proof from proof.json
    // Contract input (6 elements): [merkleRoot, candidate, vote, salt, nullifierHash, ballotHash]
    const a = proof.a;
    const b = proof.b;
    const c = proof.c;
    
    // The contract input must match the ICs in Verifier.sol:
    // IC1 = merkleRoot, IC2 = candidate, IC3 = vote, IC4 = salt, IC5 = nullifierHash, IC6 = ballotHash
    const input = [
        proofData.merkleRoot,                    // IC1 - merkleRoot
        proofData.candidate.toString(),          // IC2 - candidate  
        proofData.vote.toString(),               // IC3 - vote
        proofData.salt,                          // IC4 - salt
        proofData.nullifierHash,                 // IC5 - nullifierHash
        proofData.ballotHash                     // IC6 - ballotHash
    ];
    
    console.log("a:", a);
    console.log("b:", b);
    console.log("c:", c);
    console.log("input:", input);

    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = BallotBox.attach(ballotBoxAddress);

    console.log("\nBallotBox contract:", ballotBoxAddress);
    console.log("Ballot Count:", (await ballotBox.ballotCount()).toString());

    console.log("\nSubmitting ballot...");
    try {
        const tx = await ballotBox.submitBallot(a, b, c, input, ballotHash);
        console.log("Transaction hash:", tx.hash);
        const receipt = await tx.wait();
        
        console.log("\n=== Transaction Receipt ===");
        console.log("Block:", receipt.blockNumber);
        console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
        console.log("Gas used:", receipt.gasUsed.toString());
        
        console.log("\nBallot Count:", (await ballotBox.ballotCount()).toString());
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
