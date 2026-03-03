const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

async function buildMerkleTree() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Read voters from file
    const votersData = JSON.parse(fs.readFileSync("./voters.json", "utf8"));
    const voters = votersData.voters;
    const electionId = votersData.electionId;

    console.log(`\n=== Building Merkle Tree for Election ${electionId} ===`);
    console.log(`Number of voters: ${voters.length}`);

    // Use circuit's expected depth (10 levels = 1024 leaves)
    const levels = 10;
    const numLeaves = 2 ** levels;

    console.log(`Merkle tree depth: ${levels}`);
    console.log(`Number of leaf slots: ${numLeaves}`);

    // Step 1: Generate leaves from voter secrets
    const leaves = voters.map(voter => {
        const leaf = F.toObject(poseidon([BigInt("0x" + voter.secret)]));
        return { id: voter.id, name: voter.name, secret: voter.secret, leaf };
    });

    console.log("\n=== Voter Commitments (Leaves) ===");
    leaves.forEach(v => {
        console.log(`  ${v.name} (ID: ${v.id}): 0x${v.leaf.toString(16).padStart(64, '0')}`);
    });

    // Pad leaves with zeros to fill the tree
    const paddedLeaves = leaves.map(l => l.leaf);
    while (paddedLeaves.length < numLeaves) {
        paddedLeaves.push(0n);
    }

    // Step 2: Build Merkle Tree
    const tree = [paddedLeaves];
    for (let level = 0; level < levels; level++) {
        const currentLevel = tree[level];
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || 0;
            const hash = F.toObject(poseidon([left, right]));
            nextLevel.push(hash);
        }
        tree.push(nextLevel);
    }

    const merkleRoot = tree[levels][0];
    console.log(`\n=== Merkle Root ===`);
    console.log(`  Root: 0x${merkleRoot.toString(16).padStart(64, '0')}`);

    // Step 3: Generate proofs for each voter
    const proofs = [];
    for (let i = 0; i < leaves.length; i++) {
        const voter = leaves[i];
        const leafIndex = i;

        const pathElements = [];
        const pathIndices = [];
        let currentIndex = leafIndex;

        for (let level = 0; level < levels; level++) {
            const currentLevel = tree[level];
            const isLeft = currentIndex % 2 === 0;
            const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

            // Get sibling (or 0 if out of bounds)
            const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : 0n;

            pathElements.push(sibling);
            pathIndices.push(isLeft ? 0 : 1);

            currentIndex = Math.floor(currentIndex / 2);
        }

        proofs.push({
            voterId: voter.id,
            name: voter.name,
            secret: voter.secret,
            leaf: voter.leaf,
            pathElements: pathElements.map(x => x.toString()),
            pathIndices: pathIndices
        });
    }

    // Convert BigInt values to strings for JSON serialization
    const proofsJSON = proofs.map(p => ({
        voterId: p.voterId,
        name: p.name,
        secret: p.secret,
        leaf: p.leaf.toString(),
        pathElements: p.pathElements.map(x => x.toString()),
        pathIndices: p.pathIndices
    }));

    // Save proofs to file
    const output = {
        electionId,
        merkleRoot: merkleRoot.toString(),
        merkleRootHex: "0x" + merkleRoot.toString(16).padStart(64, '0'),
        levels,
        numLeaves,
        proofs: proofsJSON
    };

    fs.writeFileSync("./merkleProofs.json", JSON.stringify(output, null, 2));
    console.log("\n=== Output ===");
    console.log(`Merkle proofs saved to merkleProofs.json`);
    console.log(`Merkle Root (for contract): ${output.merkleRoot}`);

    return output;
}

// Run if called directly
if (require.main === module) {
    buildMerkleTree()
        .then(() => {
            console.log("\nDone!");
            process.exit(0);
        })
        .catch(err => {
            console.error("Error:", err);
            process.exit(1);
        });
}

module.exports = { buildMerkleTree };
