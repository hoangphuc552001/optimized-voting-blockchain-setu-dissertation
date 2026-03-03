const {ethers} = require("hardhat");
const fs = require("fs");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("\nDeploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // Read Merkle root from proofs file
    const proofsData = JSON.parse(fs.readFileSync("./merkleProofs.json", "utf8"));
    const electionId = proofsData.electionId;
    const merkleRoot = BigInt(proofsData.merkleRoot);

    console.log("\n=== Election Configuration ===");
    console.log("Election ID:", electionId);
    console.log("Merkle Root:", merkleRoot.toString());
    console.log("Merkle Root (Hex):", proofsData.merkleRootHex);

    // Compile first
    console.log("\nCompiling contracts...");
    await hre.run("compile");

    // Deploy Verifier (newly generated from circuit)
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("Verifier deployed to:", verifierAddress);

    // Deploy BallotBox with Verifier
    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = await BallotBox.deploy(verifierAddress, merkleRoot, electionId);
    await ballotBox.waitForDeployment();
    const ballotBoxAddress = await ballotBox.getAddress();
    console.log("BallotBox deployed to:", ballotBoxAddress);

    console.log("\nDeployment Complete!");
    console.log("\nContract Addresses:");
    console.log("- Verifier:", verifierAddress);
    console.log("- BallotBox:", ballotBoxAddress);
    console.log("\nElection Parameters:");
    console.log("- Election ID:", electionId);
    console.log("- Merkle Root:", merkleRoot.toString());
    console.log("- Merkle Root (Hex):", proofsData.merkleRootHex);
    console.log("\nIMPORTANT: Update submitBallot.js with:");
    console.log(`  const ballotBoxAddress = "${ballotBoxAddress}";`);
    console.log(`  const verifierAddress = "${verifierAddress}";`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
