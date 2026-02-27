const { ethers } = require("hardhat");

const BALLOTBOX_ADDRESS = "0x76f1a40a65744CBCEC92D31CE4857e0990e582c2";

const CALLDATA = {
    a: ["0x09408685c4ebca391baa2a3750cdf0b9d5c7bfde95cffac071e15de5e596ac11",
        "0x0d3fd2bd12db6fe1c1f26c2b901dcb598890dce118b514131739b7594a25126d"],
    b: [["0x2435762f9f3357333d739c2a280b8e82fdee0f199ac8c4193060455118c20709",
        "0x2901cb6c16034aa4815b3f6cd5882d9efde5e5bc328808ee3174500a3bb91fe6"],
    ["0x17a5ac7af8cc544fe5d6d369a8e2e24566b421c1e9d9ef9c6f9c5bc8491cae50",
        "0x2c0e0f4c1516c7964109eb07dbcb1d46bcf3d6b3501f2a4f91c09c1573c55d42"]],
    c: ["0x1d1e5a3d5ed712103fd8c136e45f773cba2fb04463c31e8bac53cf0c5557f146",
        "0x11e029dd6050916c79f2f58f9ff416a7258dde92423e3d957f33655757b1110c"],
    input: ["0x14b41af1b700d806668dba6eadab2cae8a192988aa5c5699de65049a2c0cca40"]
};

async function main() {
    const ballotBoxAddress = process.env.BALLOTBOX_ADDRESS || BALLOTBOX_ADDRESS;

    const [voter] = await ethers.getSigners();
    console.log("\nSubmitting ballot 2 from account:", voter.address);
    console.log("BallotBox address:", ballotBoxAddress);

    const BallotBox = await ethers.getContractFactory("BallotBox");
    const ballotBox = BallotBox.attach(ballotBoxAddress);

    const a = CALLDATA.a.map(x => BigInt(x));
    const b = CALLDATA.b.map(row => row.map(x => BigInt(x)));
    const c = CALLDATA.c.map(x => BigInt(x));
    const input = CALLDATA.input.map(x => BigInt(x));

    console.log("\n--- Submitting Ballot 2 ---");
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
            console.log("\n✅ Ballot 2 Accepted!");
            console.log("BallotHash:", event.args.ballotHash.toString());
        } else {
            console.log("\n⚠️  Ballot event not found in logs");
        }

        console.log("Ballot 2 submitted successfully!");

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
