const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function generateBatchInput() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const proofsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "merkleProofs.json"), "utf8"));
    const secretsData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "voter-secrets.json"), "utf8"));

    const voterMerkleRoot = BigInt(proofsData.merkleRoot);
    const electionId = BigInt(proofsData.electionId);
    const batchSize = 4;
    const stateLevels = 5;
    const numStateLeaves = 2 ** stateLevels;

    console.log("=== Generating Batch Input ===");
    console.log("Batch size:", batchSize);
    console.log("Using voters 1-4 from merkleProofs.json\n");

    const stateLeaves = new Array(numStateLeaves).fill(0n);

    function buildStateTree(leaves) {
        const tree = [];
        const level0 = leaves.map(v => F.toObject(poseidon([v])));
        tree.push(level0);

        for (let level = 0; level < stateLevels; level++) {
            const current = tree[level];
            const next = [];
            for (let i = 0; i < current.length; i += 2) {
                const left = current[i];
                const right = i + 1 < current.length ? current[i + 1] : 0n;
                next.push(F.toObject(poseidon([left, right])));
            }
            tree.push(next);
        }
        return tree;
    }

    function getStateProof(tree, index) {
        const pathElements = [];
        let currentIndex = index;

        for (let level = 0; level < stateLevels; level++) {
            const currentLevel = tree[level];
            const isLeft = currentIndex % 2 === 0;
            const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
            const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : 0n;
            pathElements.push(sibling.toString());
            currentIndex = Math.floor(currentIndex / 2);
        }

        return pathElements;
    }

    const voterSecrets = [];
    const electionIds = [];
    const candidates = [];
    const votes = [];
    const salts = [];
    const nullifierHashes = [];
    const ballotHashes = [];
    const isNoOps = [];
    const voterPathElements = [];
    const voterPathIndices = [];
    const stateLeafIndices = [];
    const stateOldValues = [];
    const stateNewValues = [];
    const statePathElements = [];

    const voteChoices = [
        { candidate: 0, vote: 1 },
        { candidate: 1, vote: 1 },
        { candidate: 2, vote: 1 },
        { candidate: 0, vote: 1 }
    ];

    let stateTree = buildStateTree(stateLeaves);
    const preStateRoot = stateTree[stateLevels][0];

    for (let i = 0; i < batchSize; i++) {
        const voterProof = proofsData.proofs[i];
        const voterSecret = BigInt("0x" + secretsData.voters[i].secret);
        const salt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));

        const choice = voteChoices[i];

        const nullifierHash = F.toObject(poseidon([voterSecret, electionId]));
        const ballotHash = F.toObject(poseidon([BigInt(choice.candidate), BigInt(choice.vote), salt]));

        voterSecrets.push(voterSecret.toString());
        electionIds.push(electionId.toString());
        candidates.push(choice.candidate.toString());
        votes.push(choice.vote.toString());
        salts.push(salt.toString());
        nullifierHashes.push(nullifierHash.toString());
        ballotHashes.push(ballotHash.toString());
        isNoOps.push("0");
        voterPathElements.push(voterProof.pathElements.map(e => e.toString()));
        voterPathIndices.push(voterProof.pathIndices);

        const candidateIdx = choice.candidate;
        const oldVal = stateLeaves[candidateIdx];
        const proof = getStateProof(stateTree, candidateIdx);

        stateLeafIndices.push(candidateIdx.toString());
        stateOldValues.push(oldVal.toString());

        const newVal = oldVal + BigInt(choice.vote);
        stateNewValues.push(newVal.toString());
        statePathElements.push(proof);

        stateLeaves[candidateIdx] = newVal;
        stateTree = buildStateTree(stateLeaves);

        console.log(`Vote ${i + 1}: Voter ${voterProof.voterId} -> Candidate ${choice.candidate} (vote=${choice.vote})`);
    }

    const postStateRoot = stateTree[stateLevels][0];

    const batchNullifierHash = F.toObject(
        poseidon(nullifierHashes.map(n => BigInt(n)))
    );

    const batchInput = {
        preStateRoot: preStateRoot.toString(),
        postStateRoot: postStateRoot.toString(),
        batchNullifierHash: batchNullifierHash.toString(),
        voterMerkleRoot: voterMerkleRoot.toString(),
        voterSecrets,
        electionIds,
        candidates,
        votes,
        salts,
        nullifierHashes,
        ballotHashes,
        isNoOp: isNoOps,
        voterPathElements,
        voterPathIndices,
        stateLeafIndices,
        stateOldValues,
        stateNewValues,
        statePathElements
    };

    const outputPath = path.join(__dirname, "..", "batch_input.json");
    fs.writeFileSync(outputPath, JSON.stringify(batchInput, null, 2));

    console.log("\n=== Batch Input Generated ===");
    console.log("Pre-state root:", preStateRoot.toString().substring(0, 30) + "...");
    console.log("Post-state root:", postStateRoot.toString().substring(0, 30) + "...");
    console.log("Batch nullifier hash:", batchNullifierHash.toString().substring(0, 30) + "...");
    console.log("Saved to:", outputPath);

    return batchInput;
}

if (require.main === module) {
    generateBatchInput()
        .then(() => {
            console.log("\nDone!");
            process.exit(0);
        })
        .catch(err => {
            console.error("Error:", err);
            process.exit(1);
        });
}

module.exports = { generateBatchInput };
