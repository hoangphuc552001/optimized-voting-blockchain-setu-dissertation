import { ethers } from "hardhat";

async function main() {
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  console.log(`Checking contract at: ${contractAddress}`);

  // Get provider
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");

  // Check if contract exists
  const code = await provider.getCode(contractAddress);
  console.log(`Contract code length: ${code.length}`);

  if (code === "0x") {
    console.log("❌ No contract found at this address");
  } else {
    console.log("✅ Contract found at this address");
  }

  // Try to get candidates count
  try {
    const contract = await ethers.getContractAt("Election", contractAddress);
    console.log("Contract connected successfully");

    const count = await contract.getCandidatesCount();
    console.log(`Candidates count: ${count}`);
  } catch (error) {
    console.log("❌ Error connecting to contract:", error.message);
  }
}

main().catch(console.error);