const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const snarkjs = require("snarkjs");

async function generateProof() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Read Merkle proofs from file (contains pathElements, pathIndices, leaf - NO secret)
    const proofsData = JSON.parse(fs.readFileSync("./merkleProofs.json", "utf8"));
    // Read voter secrets from private file (each voter has their own)
    const voterSecretsData = JSON.parse(fs.readFileSync("./voter-secrets.json", "utf8"));
    const merkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = BigInt(proofsData.electionId);

    // Pick a voter (Alice - voterId 1)
    const voter = proofsData.proofs[0]; // Alice - index 0
    const voterSecretData = voterSecretsData.voters[0]; // Get secret from private file
    const voterSecret = BigInt("0x" + voterSecretData.secret);
    const pathElements = voter.pathElements;
    const pathIndices = voter.pathIndices;

    console.log("\n=== Generating Proof for Voter ===");
    console.log("Voter:", voter.name);
    console.log("Voter ID:", voter.voterId);
    console.log("Note: Secret loaded from voter-secrets.json (simulates voter's private file)");

    // Vote parameters
    const candidate = 2;  // Vote for candidate 2
    const vote = 1;       // Vote = 1 (approve)
    
    // Generate a random salt for the vote
    const salt = BigInt("0x" + require("crypto").randomBytes(31).toString("hex"));

    // ============ Compute Nullifier (per specification) ============
    // Nullifier = Poseidon(voterSecret, electionId) - unique per voter per election
    const nullifierHasher = poseidon.F.toObject(poseidon([voterSecret, electionId]));
    
    // ============ Compute Ballot Hash (vote commitment) ============
    // BallotHash = Poseidon(candidate, vote, salt) - encrypts the vote
    const ballotHasher = poseidon.F.toObject(poseidon([BigInt(candidate), BigInt(vote), salt]));
    
    // Prepare inputs for the circuit - convert all to appropriate types
    const input = {
        // Private inputs (known only to voter)
        voterSecret: voterSecret.toString(),
        electionId: electionId.toString(),
        pathElements: pathElements,
        pathIndices: pathIndices,
        // Public inputs (order must match circuit: merkleRoot, candidate, vote, salt, nullifierHash, ballotHash)
        merkleRoot: merkleRoot.toString(),
        candidate: candidate.toString(),
        vote: vote.toString(),
        salt: salt.toString(),
        nullifierHash: nullifierHasher.toString(),
        ballotHash: ballotHasher.toString()
    };

    fs.writeFileSync("input_vote.json", JSON.stringify(input, null, 2));
    console.log("\nInput saved to input_vote.json");
    console.log("  merkleRoot:", input.merkleRoot);
    console.log("  candidate:", input.candidate);
    console.log("  vote:", input.vote);
    console.log("  salt:", input.salt);
    console.log("  nullifierHash:", input.nullifierHash);
    console.log("  ballotHash:", input.ballotHash);
    console.log("  electionId:", input.electionId);

    console.log("\nGenerating witness and proof...");
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        "build/BasicVote_js/BasicVote.wasm",
        "build/BasicVote_0001.zkey"
    );

    console.log("\nProof successfully generated!");
    console.log("Public Signals:", publicSignals);

    // Parse the calldata output
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    console.log("\nRaw Calldata Output:", calldata);

    const argv = calldata.replace(/["[\]\s]/g, "").split(",");

    // Format proof for contract
    // Contract expects: [merkleRoot, candidate, vote, salt, nullifierHash, ballotHash]
    const formattedProof = {
        a: [argv[0], argv[1]],
        b: [[argv[2], argv[3]], [argv[4], argv[5]]],
        c: [argv[6], argv[7]],
        input: [
            merkleRoot.toString(),         // merkleRoot
            candidate.toString(),          // candidate
            vote.toString(),               // vote
            salt.toString(),              // salt
            nullifierHasher.toString(),   // nullifierHash
            ballotHasher.toString()       // ballotHash
        ]
    };

    console.log("\n=== Proof Details ===");
    console.log("Merkle Root:", merkleRoot.toString());
    console.log("Nullifier Hash (from voterSecret + electionId):", nullifierHasher.toString());
    console.log("Ballot Hash (vote commitment):", ballotHasher.toString());
    console.log("Candidate:", candidate);
    console.log("Vote:", vote);
    console.log("Election ID:", electionId.toString());

    // Save proof to file
    const proofData = {
        voter: voter.name,
        voterId: voter.voterId,
        voterSecret: voterSecretData.secret,
        electionId: electionId.toString(),
        candidate,
        vote,
        merkleRoot: merkleRoot.toString(),
        nullifierHash: nullifierHasher.toString(),
        ballotHash: ballotHasher.toString(),
        salt: salt.toString(),
        proof: formattedProof
    };

    fs.writeFileSync("./proof.json", JSON.stringify(proofData, null, 2));
    console.log("\nProof saved to proof.json");

    return proofData;
}

// Run if called directly
if (require.main === module) {
    generateProof()
        .then(result => {
            console.log("\n=== Final Proof ===");
            console.log(JSON.stringify(result.proof, null, 2));
        })
        .catch(err => {
            console.error("Error:", err);
            process.exit(1);
        });
}

module.exports = { generateProof };
