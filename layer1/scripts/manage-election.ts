import { config } from "dotenv";
config(); // Load environment variables from .env file

import { ethers } from "hardhat";
import { Election } from "../typechain-types";

async function main() {
  // Set up provider and signer
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "http://localhost:8545");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

  // Election contract address - replace with actual deployed address
  const electionAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  console.log("Managing election at address:", electionAddress);
  console.log("Deployer address:", wallet.address);

  const election = await ethers.getContractAt("Election", electionAddress, wallet);

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "register":
      await registerVoters(election, args.slice(1));
      break;
    case "status":
      await showElectionStatus(election);
      break;
    case "results":
      await showElectionResults(election);
      break;
    case "winner":
      await showWinner(election);
      break;
    default:
      console.log("Usage:");
      console.log("  npm run manage register <voter1> <voter2> ...  - Register voters");
      console.log("  npm run manage status                           - Show election status");
      console.log("  npm run manage results                          - Show all candidate results");
      console.log("  npm run manage winner                           - Show winner");
  }
}

async function registerVoters(election: Election, voterAddresses: string[]) {
  console.log("Registering voters:", voterAddresses);

  if (voterAddresses.length === 0) {
    console.log("No voter addresses provided");
    return;
  }

  try {
    const tx = await election.batchRegisterVoters(voterAddresses);
    await tx.wait();
    console.log("Successfully registered", voterAddresses.length, "voters");
  } catch (error) {
    console.error("Error registering voters:", error);
  }
}

async function showElectionStatus(election: Election) {
  try {
    const [startTime, endTime, isActive, totalCandidates, totalRegisteredVoters] = await election.getElectionStatus();
    const admin = await election.admin();

    console.log("\nElection Status:");
    console.log("- Admin:", admin);
    console.log("- Start Time:", new Date(Number(startTime) * 1000).toISOString());
    console.log("- End Time:", new Date(Number(endTime) * 1000).toISOString());
    console.log("- Is Active:", isActive);
    console.log("- Total Candidates:", totalCandidates);
    console.log("- Total Registered Voters:", totalRegisteredVoters);

    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilStart = Number(startTime) - currentTime;
    const timeUntilEnd = Number(endTime) - currentTime;

    if (timeUntilStart > 0) {
      console.log(`- Time until voting starts: ${Math.floor(timeUntilStart / 3600)}h ${Math.floor((timeUntilStart % 3600) / 60)}m`);
    } else if (timeUntilEnd > 0) {
      console.log(`- Time until voting ends: ${Math.floor(timeUntilEnd / 3600)}h ${Math.floor((timeUntilEnd % 3600) / 60)}m`);
    } else {
      console.log("- Voting has ended");
    }
  } catch (error) {
    console.error("Error getting election status:", error);
  }
}

async function showElectionResults(election: Election) {
  try {
    const candidatesCount = await election.getCandidatesCount();
    console.log("\nElection Results:");

    for (let i = 0; i < candidatesCount; i++) {
      const [name, voteCount] = await election.getCandidate(i);
      console.log(`- ${name}: ${voteCount} votes`);
    }
  } catch (error) {
    console.error("Error getting election results:", error);
  }
}

async function showWinner(election: Election) {
  try {
    const [winnerId, winnerName, winnerVotes] = await election.getWinner();
    console.log("\nElection Winner:");
    console.log(`- Winner: ${winnerName} (ID: ${winnerId})`);
    console.log(`- Votes: ${winnerVotes}`);
  } catch (error) {
    console.error("Error getting winner (election might still be active):", error);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
