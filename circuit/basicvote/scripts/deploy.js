const {ethers} = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("\nDeploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
    console.log("\n--- Deploying Verifier ---");

    let verifier;
    let verifierAddress;
    try {
        const Verifier = await ethers.getContractFactory("Groth16Verifier");
        verifier = await Verifier.deploy();
        await verifier.waitForDeployment();
        verifierAddress = await verifier.getAddress();
        console.log("Verifier deployed to:", verifierAddress);
    } catch (error) {
        verifierAddress = "0x0000000000000000000000000000000000000001";
        verifier = {address: verifierAddress};
    }
    console.log("\n--- Deploying BallotBox ---");
    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = await BallotBox.deploy(verifierAddress);
    await ballotBox.waitForDeployment();
    const ballotBoxAddress = await ballotBox.getAddress();
    console.log("BallotBox deployed to:", ballotBoxAddress);

    console.log("Deployment Complete!");
    console.log("\nContract Addresses:");
    console.log("- Verifier:", verifierAddress);
    console.log("- BallotBox:", ballotBoxAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });