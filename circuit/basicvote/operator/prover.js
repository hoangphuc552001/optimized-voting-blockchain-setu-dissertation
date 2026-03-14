const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

class Prover {
    constructor(wasmPath, zkeyPath) {
        this.wasmPath = wasmPath;
        this.zkeyPath = zkeyPath;
    }

    async generateProof(batchInput) {
        console.log("[PROVE] Generating witness...");
        const startWitness = Date.now();

        const inputFile = path.join(__dirname, "..", "build", "batch_input_temp.json");
        fs.writeFileSync(inputFile, JSON.stringify(batchInput, null, 2));

        try {
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                batchInput,
                this.wasmPath,
                this.zkeyPath
            );

            const witnessTime = ((Date.now() - startWitness) / 1000).toFixed(1);
            console.log(`[PROVE] Proof generated in ${witnessTime}s`);

            const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
            const argv = calldata.replace(/["[\]\s]/g, "").split(",");

            const formattedProof = {
                a: [argv[0], argv[1]],
                b: [[argv[2], argv[3]], [argv[4], argv[5]]],
                c: [argv[6], argv[7]]
            };

            return {
                proof,
                publicSignals,
                formattedProof,
                calldata
            };
        } catch (err) {
            console.error("[PROVE] Proof generation failed:", err.message);
            throw err;
        } finally {
            if (fs.existsSync(inputFile)) {
                fs.unlinkSync(inputFile);
            }
        }
    }
}

module.exports = { Prover };
