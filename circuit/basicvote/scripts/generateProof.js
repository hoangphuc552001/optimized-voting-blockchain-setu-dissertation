const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const snarkjs = require("snarkjs");

async function generateProof() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Read Merkle proofs from file
    const proofsData = JSON.parse(fs.readFileSync("./merkleProofs.json", "utf8"));
    const votersData = JSON.parse(fs.readFileSync("./voters.json", "utf8"));
    const merkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = proofsData.electionId;

    // Pick a voter (Alice - voterId 1)
    const voter = proofsData.proofs[0]; // Alice - index 0
    const voterData = votersData.voters[0]; // Get original secret from voters.json
    const voterSecret = voterData.secret;
    const pathElements = voter.pathElements;
    const pathIndices = voter.pathIndices;

    console.log("\n=== Generating Proof for Voter ===");
    console.log("Voter:", voter.name);
    console.log("Voter ID:", voter.voterId);

    // Vote parameters
    const candidate = 2;  // Vote for candidate 2
    const vote = 1;       // Vote = 1 (approve)
    
    // Generate a random salt for the vote
    const salt = BigInt("0x" + require("crypto").randomBytes(31).toString("hex"));

    // Compute the ballotHash (nullifier) - Poseidon(candidate, vote, salt)
    const ballotHasher = poseidon.F.toObject(poseidon([BigInt(candidate), BigInt(vote), salt]));
    
    // Prepare inputs for the circuit - convert all to appropriate types
    const input = {
        // Private inputs - convert hex string to BigInt (circuit will hash this)
        voterSecret: BigInt("0x" + voterSecret).toString(),
        pathElements: pathElements,
        pathIndices: pathIndices,
        // Public inputs (order must match circuit: merkleRoot, candidate, vote, salt, ballotHash)
        merkleRoot: merkleRoot.toString(),
        candidate: candidate.toString(),
        vote: vote.toString(),
        salt: salt.toString(),
        ballotHash: ballotHasher.toString()
    };

    fs.writeFileSync("input_vote.json", JSON.stringify(input, null, 2));
    console.log("\nInput saved to input_vote.json");
    console.log("  merkleRoot:", input.merkleRoot);
    console.log("  candidate:", input.candidate);
    console.log("  vote:", input.vote);
    console.log("  salt:", input.salt);

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

    // Public signals now include: [ballotHash, merkleRoot, candidate, vote, salt]
    const computedBallotHash = publicSignals[0];
    const computedMerkleRoot = publicSignals[1];

    // Format proof for contract
    // Contract expects: [merkleRoot, candidate, vote, salt, ballotHash]
    const formattedProof = {
        a: [argv[0], argv[1]],
        b: [[argv[2], argv[3]], [argv[4], argv[5]]],
        c: [argv[6], argv[7]],
        input: [
            merkleRoot.toString(),         // merkleRoot
            candidate.toString(),        // candidate
            vote.toString(),            // vote
            salt.toString(),           // salt
            ballotHasher.toString()    // ballotHash
        ]
    };

    console.log("\n=== Proof Details ===");
    console.log("Merkle Root:", merkleRoot.toString());
    console.log("Ballot Hash (Nullifier):", ballotHasher.toString());
    console.log("Candidate:", candidate);
    console.log("Vote:", vote);
    console.log("Election ID:", electionId);

    // Save proof to file
    const proofData = {
        voter: voter.name,
        voterId: voter.voterId,
        candidate,
        vote,
        merkleRoot: merkleRoot.toString(),
        electionId,
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
