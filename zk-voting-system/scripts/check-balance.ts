import { ethers } from "hardhat";

function formatEtherFromWei(weiStr: string) {
  const weiBn = BigInt(weiStr);
  const base = 1000000000000000000n;
  const intPart = weiBn / base;
  const frac = weiBn % base;
  if (frac === 0n) return intPart.toString();
  // trim trailing zeros in fractional part
  let fracStr = frac.toString().padStart(18, "0");
  fracStr = fracStr.replace(/0+$/, "");
  return `${intPart.toString()}.${fracStr}`;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network);

  const signers = await ethers.getSigners();
  let address: string;
  let balance;

  if (signers.length > 0) {
    const first = signers[0] as any;
    if (typeof first.getAddress === "function") {
      address = await first.getAddress();
      if (typeof first.getBalance === "function") {
        balance = await first.getBalance();
      } else {
        balance = await ethers.provider.getBalance(address);
      }
    } else {
      // fallback: signer is an address string
      address = first;
      balance = await ethers.provider.getBalance(address);
    }
  } else {
    const accounts = await ethers.provider.listAccounts();
    address = accounts[0];
    balance = await ethers.provider.getBalance(address);
  }

  console.log("Deployer address:", address);
  console.log("Balance (wei):", balance.toString());
  console.log("Balance (ETH):", formatEtherFromWei(balance.toString()));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

