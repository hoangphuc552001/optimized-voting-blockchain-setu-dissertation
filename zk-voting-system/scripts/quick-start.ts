import { config } from "dotenv";
config(); // Load environment variables from .env file

import { ethers } from "hardhat";
import { ElectionService } from "../backend/services/ElectionService";

async function main() {
  console.log("🚀 Quick Start: End-to-End Voting System Setup\n");

  try {
    // Step 1: Deploy Election Contract
    console.log("📝 Step 1: Deploying Election Contract...");
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "http://localhost:8545");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

    const electionService = new ElectionService(wallet);

    const candidates = ["Alice Johnson", "Bob Smith", "Charlie Brown"];
    const startTime = Math.floor(Date.now() / 1000) + 60; // Start in 1 minute
    const endTime = startTime + 300; // End in 5 minutes

    const contractAddress = await electionService.deployElection(candidates, startTime, endTime);
    console.log(`✅ Election deployed at: ${contractAddress}\n`);

    // Step 2: Register Test Voters
    console.log("👥 Step 2: Registering Test Voters...");
    const testVoters = [
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Default Hardhat account 1
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Default Hardhat account 2
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906"  // Default Hardhat account 3
    ];

    await electionService.registerVoters(contractAddress, testVoters);
    console.log(`✅ Registered ${testVoters.length} voters\n`);

    // Step 3: Display Setup Information
    console.log("📋 Step 3: Setup Complete!");
    console.log("=".repeat(50));
    console.log(`Election Contract: ${contractAddress}`);
    console.log(`Candidates: ${candidates.join(", ")}`);
    console.log(`Voting Starts: ${new Date(startTime * 1000).toLocaleString()}`);
    console.log(`Voting Ends: ${new Date(endTime * 1000).toLocaleString()}`);
    console.log(`Registered Voters: ${testVoters.length}`);
    console.log("=".repeat(50));

    // Step 4: Instructions
    console.log("\n🎯 Next Steps:");
    console.log("1. Copy the election contract address above");
    console.log("2. Update ELECTION_ADDRESS in public/index.html");
    console.log("3. Start the backend: npm run server:dev");
    console.log("4. Open public/index.html in your browser");
    console.log("5. Connect MetaMask to local network (http://localhost:8545)");
    console.log("6. Import test accounts from Hardhat node output");
    console.log("7. Start voting!");
    console.log("\n🔍 Monitor real-time updates:");
    console.log(`npm run monitor start ${contractAddress}`);

  } catch (error) {
    console.error("❌ Setup failed:", error);
    console.log("\n🔧 Troubleshooting:");
    console.log("- Make sure Hardhat node is running: npm run node");
    console.log("- Check your .env file has correct configuration");
    console.log("- Ensure you have test accounts with ETH");
    process.exit(1);
  }
}

main().catch(console.error);
