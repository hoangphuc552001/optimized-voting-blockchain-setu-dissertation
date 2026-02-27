const { ethers } = require("hardhat");

const VERIFIER_ADDRESS = "0x13b837f435A16aFB7Bd8e6Dd7248D2Efe61772B8";

const VOTE1_CALLDATA = {
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

const VOTE2_CALLDATA = {
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

async function verifyCalldata(verifier, name, calldata) {
    const a = calldata.a.map(x => BigInt(x));
    const b = calldata.b.map(row => row.map(x => BigInt(x)));
    const c = calldata.c.map(x => BigInt(x));
    const input = calldata.input.map(x => BigInt(x));

    try {
        const result = await verifier.verifyProof(a, b, c, input);
        console.log(`${name} verification result:`, result);
    } catch (error) {
        console.error(`${name} error:`, error.message);
    }
}

async function main() {
    console.log("Testing Verifier at:", VERIFIER_ADDRESS);
    const verifier = await ethers.getContractAt("Groth16Verifier", VERIFIER_ADDRESS);

    await verifyCalldata(verifier, "Vote 1 (candidate=2, vote=1)", VOTE1_CALLDATA);
    await verifyCalldata(verifier, "Vote 2 (candidate=3, vote=1)", VOTE2_CALLDATA);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
