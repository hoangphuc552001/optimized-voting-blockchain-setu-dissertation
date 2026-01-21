// npm install snarkjs

const fs = require("fs");
const snarkjs = require("snarkjs");
const { execSync } = require("child_process");

async function main() {
    // 1. Prepare witness input (a=2, b=3 -> 2+3=5)
    const input = {
        a: "2",
        b: "3"
    };

    // 2. Generate the witness using the wasm & witness calculator
    fs.writeFileSync("input.json", JSON.stringify(input, null, 2));
    execSync("node circuit_js/generate_witness.js circuit_js/circuit.wasm input.json witness.wtns");

    // 3. Generate proof (Groth16)
    const { proof, publicSignals } = await snarkjs.groth16.prove(
        "circuit_0000.zkey",
        "witness.wtns"
    );

    console.log("Public signals:", publicSignals);

    // 4. Verify proof
    const vKey = JSON.parse(fs.readFileSync("verification_key.json", "utf8"));

    const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    console.log("Verification result:", res); // true if valid
}

main().catch(console.error);
