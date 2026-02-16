import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Election contract...");

  // Get the contract factory
  const Election = await ethers.getContractFactory("Election");

  // Define election parameters
  const candidateNames = ["Alice Johnson", "Bob Smith", "Charlie Brown"];
  const startTime = Math.floor(Date.now() / 1000);
  const endTime = startTime + 10 * 365 * 24 * 60 * 60;

  console.log("Election parameters:");
  console.log("- Candidates:", candidateNames);
  console.log("- Start time:", new Date(startTime * 1000).toISOString());
  console.log("- End time:", new Date(endTime * 1000).toISOString());

  // Deploy the contract
  const election = await Election.deploy(candidateNames, startTime, endTime);

  await election.waitForDeployment();

  const address = await election.getAddress();
  console.log("Election contract deployed to:", address);

  // Verify deployment
  console.log("\nVerifying deployment...");
  const admin = await election.admin();
  const candidatesCount = await election.getCandidatesCount();

  console.log("- Admin:", admin);
  console.log("- Number of candidates:", candidatesCount);
  console.log("- Contract start time:", await election.startTime());
  console.log("- Contract end time:", await election.endTime());

  return address;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
