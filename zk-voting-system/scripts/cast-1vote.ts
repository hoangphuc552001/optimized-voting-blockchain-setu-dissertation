import { ethers } from "hardhat";

async function main() {
  const contractAddress = process.env.ELECTION_ADDRESS;
  if (!contractAddress) throw new Error("Set CONTRACT_ADDRESS in env");

  const candidateId = process.env.CANDIDATE_ID ? parseInt(process.env.CANDIDATE_ID) : 0;
  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  const election = await ethers.getContractAt("Election", contractAddress, signer);

  console.log("Signer:", signerAddr);
  const admin = await election.admin();
  console.log("Admin:", admin);

  const status = await election.getElectionStatus();
  const startTime = Number(status[0]);
  const endTime = Number(status[1]);
  const isActive = status[2];
  console.log("Start:", new Date(startTime * 1000).toISOString());
  console.log("End:  ", new Date(endTime * 1000).toISOString());
  console.log("Voting active:", isActive);

  if (!isActive) throw new Error("Voting is not active right now.");

  const registered = await election.isRegisteredVoter(signerAddr);
  if (!registered) {
    if (admin.toLowerCase() === signerAddr.toLowerCase()) {
      console.log("Signer is admin and not registered -> registering signer now...");
      const txReg = await election.registerVoter(signerAddr);
      await txReg.wait();
      console.log("Registered signer.");
    } else {
      throw new Error("Signer is not registered and is not admin. Ask admin to register you.");
    }
  } else {
    console.log("Signer already registered.");
  }

  console.log("Casting vote for candidateId =", candidateId);
  const tx = await election.vote(candidateId);
  const receipt = await tx.wait();
  console.log("Vote transaction hash:", receipt.transactionHash);
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});

