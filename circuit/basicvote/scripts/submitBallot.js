const { ethers } = require("hardhat");

const BALLOTBOX_ADDRESS = "0x76f1a40a65744CBCEC92D31CE4857e0990e582c2";

const CALLDATA = {
  a: ["0x24f424cdb717001daae29cccb2401982630f601381ee363311c35c84e1b05f10",
    "0x28878b349d1f17c76c7ebfe546ba7b73700876dcd7d765eefc5fb239dbb23133"],
  b: [["0x15860fa17ec64f1b9434a6163bc1eaedfca792777e96191b329acb2310ad1fe0",
    "0x2312df6931dd4dae680d6e35ba4ac7b4de3df8e7b37f4f86b4876b748971d591"],
  ["0x105744eccfdc4646e27a9d14bd14bb3fde079843a336c51ac04328e008db4314",
    "0x2d72eae5a34948b2f64a0016677a74595f73d5dc226a706d4591c9c58d2c41eb"]],
  c: ["0x10ddc0cad0ae781ff3d694483a79993d1ee2bca3b6338328f6eada156445073a",
    "0x1c64a3105f972d672ef882b18b4000a77c97cc14a603e9a2aacd59625c46549d"],
  input: ["0x10a8573ca2c6f29edbb1a0d9d9331133813aa4a8a85faff368ce79da3ce0b244"]
};

async function main() {
  const ballotBoxAddress = process.env.BALLOTBOX_ADDRESS || BALLOTBOX_ADDRESS;

  const [voter] = await ethers.getSigners();
  console.log("\nSubmitting ballot from account:", voter.address);
  console.log("BallotBox address:", ballotBoxAddress);

  const BallotBox = await ethers.getContractFactory("BallotBox");
  const ballotBox = BallotBox.attach(ballotBoxAddress);

  const a = CALLDATA.a.map(x => BigInt(x));
  const b = CALLDATA.b.map(row => row.map(x => BigInt(x)));
  const c = CALLDATA.c.map(x => BigInt(x));
  const input = CALLDATA.input.map(x => BigInt(x));

  console.log("\n--- Submitting Ballot ---");
  console.log("Proof (a):", a);
  console.log("Proof (b):", b);
  console.log("Proof (c):", c);
  console.log("Public input (ballotHash):", input);

  try {
    const tx = await ballotBox.submitBallot(
      a,
      b,
      c,
      input
    );

    console.log("\nTransaction submitted!");
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("\nTransaction confirmed!");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    const event = receipt.logs.find(log => {
      try {
        return log.fragment && log.fragment.name === 'BallotAccepted';
      } catch {
        return false;
      }
    });

    if (event) {
      console.log("\n✅ Ballot Accepted!");
      console.log("BallotHash:", event.args.ballotHash.toString());
    } else {
      console.log("\n⚠️  Ballot event not found in logs");
    }

    console.log("Ballot submitted successfully!");

  } catch (error) {
    console.error("\n❌ Error submitting ballot:");
    console.error("  ", error.message);

    if (error.message.includes("Invalid ZK proof")) {
    } else if (error.message.includes("Ballot already submitted")) {
      console.log("\n   This exact ballot has already been submitted.");
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
