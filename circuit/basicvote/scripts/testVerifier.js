const { ethers } = require("hardhat");

const VERIFIER_ADDRESS = "0xF447FD5c692d981372F31FAA07c06C400A4e27ce";

const CALLDATA = {
  a: ["0x1c4c6e8476284c2d04e61c118b3b912553d6d33085c60f6e617e53be354c59a8", "0x22012c5b7425e174e993905ccdae908de04320bf6d2eff940ac078bf8a130cef"],
  b: [["0x2c5fb5396825ef2f2b00a7b3ccfa9614684c8c7f8d4ba9ba1fdf52ebd4a654f3", "0x0705b7c3218ce3eb33f4ec5824dc731c5b07960e4a3f10ad6aa6faf3ed24d558"], ["0x0746d58b0e1d55a24ea80871e79943a0364426793bb3a9def0bc97972001950f", "0x0dfdf3d0db7c1cbafa655296472922bd22a290ffa3f2468f57d9fa171f942260"]],
  c: ["0x2bb191ed38f84cebb44ea2f2dc2deadb3accd8152265deabc7faf56c5a0cebf2", "0x2fcd12f32e357d6502f2e6533e589f07cf7c1d8390b04e7c0a7417b32c8af386"],
  input: ["0x10a8573ca2c6f29edbb1a0d9d9331133813aa4a8a85faff368ce79da3ce0b244"]
};

async function main() {
    console.log("Testing Verifier directly...");
    
    const verifier = await ethers.getContractAt("Groth16Verifier", VERIFIER_ADDRESS);
    
    const a = CALLDATA.a.map(x => BigInt(x));
    const b = CALLDATA.b.map(row => row.map(x => BigInt(x)));
    const c = CALLDATA.c.map(x => BigInt(x));
    const input = CALLDATA.input.map(x => BigInt(x));
    
    console.log("Calling verifier with proof...");
    
    try {
        const result = await verifier.verifyProof(a, b, c, input);
        console.log("Verification result:", result);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
