const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

/**
 * generateVoteProof.js — Layer 1: Simulate voters generating individual ZK proofs
 *
 * In production, each voter would run this on their OWN device.
 * The voter's secret NEVER leaves their device.
 * Only the proof + public signals (nullifierHash, candidate, vote) are sent to the operator.
 */

async function generateVoteProofs() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Load voter data
    const proofsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "merkleProofs.json"), "utf8"));
    const secretsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "voter-secrets.json"), "utf8"));

    const voterMerkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = BigInt(proofsData.electionId);

    // Vote choices for each voter
    const voteChoices = [
        { candidate: 0, vote: 1 },
        { candidate: 1, vote: 1 },
        { candidate: 2, vote: 1 },
        { candidate: 3, vote: 1 },
        { candidate: 4, vote: 1 },
        { candidate: 0, vote: 1 },
        { candidate: 1, vote: 1 },
        { candidate: 2, vote: 1 },
        { candidate: 3, vote: 1 },
        { candidate: 4, vote: 1 },
        { candidate: 0, vote: 1 },
        { candidate: 1, vote: 1 },
        { candidate: 2, vote: 1 },
        { candidate: 3, vote: 1 },
        { candidate: 4, vote: 1 },
        { candidate: 0, vote: 1 }
    ];

    const batchSize = Math.min(voteChoices.length, proofsData.proofs.length, secretsData.voters.length);
    console.log(`\n=== Generating ${batchSize} Individual Vote Proofs (Layer 1) ===`);
    console.log("Each voter generates their proof locally — secrets never leave the device\n");

    // Check if compiled circuit exists
    const wasmPath = path.join(__dirname, "..", "build", "vote_proof", "VoteProof_js", "VoteProof.wasm");
    const zkeyPath = path.join(__dirname, "..", "build", "vote_proof_0001.zkey");

    if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
        console.error("Error: VoteProof circuit not compiled. Run:");
        console.error("  circom circuits/VoteProof.circom --r1cs --wasm --sym -o build/vote_proof");
        console.error("  snarkjs groth16 setup build/vote_proof/VoteProof.r1cs build/pot16_final.ptau build/vote_proof_0000.zkey");
        console.error("  snarkjs zkey contribute build/vote_proof_0000.zkey build/vote_proof_0001.zkey --name=\"Vote proof\" -v -e=\"random\"");
        process.exit(1);
    }

    const voteProofs = [];

    for (let i = 0; i < batchSize; i++) {
        const voterProof = proofsData.proofs[i];
        const voterSecret = BigInt("0x" + secretsData.voters[i].secret);
        const choice = voteChoices[i];

        // Compute nullifier hash
        const nullifierHash = F.toObject(poseidon([voterSecret, electionId]));

        // Build circuit input (this runs on the VOTER'S device)
        const circuitInput = {
            // PRIVATE (never sent anywhere)
            voterSecret: voterSecret.toString(),
            voterPathElements: voterProof.pathElements.map(e => e.toString()),
            voterPathIndices: voterProof.pathIndices,
            // PUBLIC (sent to operator with proof)
            nullifierHash: nullifierHash.toString(),
            candidate: choice.candidate.toString(),
            vote: choice.vote.toString(),
            voterMerkleRoot: voterMerkleRoot.toString(),
            electionId: electionId.toString()
        };

        console.log(`  Voter ${i + 1}: generating proof (candidate=${choice.candidate}, vote=${choice.vote})...`);
        const startTime = Date.now();

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            circuitInput,
            wasmPath,
            zkeyPath
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`    ✓ Proof generated in ${elapsed}s`);

        // The voter sends ONLY this to the operator (no secret!)
        voteProofs.push({
            voterIndex: i,
            proof: proof,
            publicSignals: publicSignals,
            // Decoded public signals for readability
            nullifierHash: publicSignals[0],
            candidate: parseInt(publicSignals[1]),
            vote: parseInt(publicSignals[2]),
            voterMerkleRoot: publicSignals[3],
            electionId: publicSignals[4]
        });
    }

    // Save all vote proofs
    const outputPath = path.join(__dirname, "..", "build", "vote_proofs.json");
    fs.writeFileSync(outputPath, JSON.stringify(voteProofs, null, 2));

    console.log(`\n=== ${batchSize} Vote Proofs Generated ===`);
    console.log(`Saved to: ${outputPath}`);
    console.log("\nWhat the operator receives (NO secrets):");
    voteProofs.forEach((vp, i) => {
        console.log(`  Vote ${i + 1}: candidate=${vp.candidate}, vote=${vp.vote}, nullifier=${vp.nullifierHash.substring(0, 20)}...`);
    });

    return voteProofs;
}

if (require.main === module) {
    generateVoteProofs()
        .then(() => {
            console.log("\nDone!");
            process.exit(0);
        })
        .catch(err => {
            console.error("Error:", err);
            process.exit(1);
        });
}

module.exports = { generateVoteProofs };
