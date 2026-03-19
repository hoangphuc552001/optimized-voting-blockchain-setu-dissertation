const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Voter Registration Script
 * 
 * This script simulates the voter registration process where:
 * 1. Each voter generates their OWN secret locally (not assigned by admin)
 * 2. Each voter computes their leaf = Poseidon(secret)
 * 3. Each voter submits ONLY their leaf to the admin
 * 4. Admin builds Merkle tree from leaves (never sees secrets)
 * 
 * In production, steps 1-3 would be done by each voter on their own device.
 * This script generates both files to simulate this process.
 */

async function registerVoters() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    
    const electionId = 1;
    const numVoters = 16;
    
    console.log("\n=== VOTER REGISTRATION FLOW (Updated) ===");
    console.log("This simulates each voter generating their own secret locally");
    console.log("In production: each voter runs this on their own device\n");
    
    // Step 1: Each voter generates their own random secret
    console.log("--- Step 1: Voter generates secret locally ---");
    const voterSecrets = [];
    
    for (let i = 1; i <= numVoters; i++) {
        // In production, voter generates this on their device
        // Using random values for each voter
        const randomBytes = crypto.randomBytes(32);
        const secret = BigInt("0x" + randomBytes.toString("hex"));
        
        voterSecrets.push({
            id: i,
            secret: randomBytes.toString("hex")
        });
        
        console.log(`  Voter ${i}: generated secret (kept private)`);
    }
    
    // Step 2: Each voter computes their leaf from their secret
    console.log("\n--- Step 2: Voter computes leaf = Poseidon(secret) ---");
    const voterLeaves = [];
    
    for (const voter of voterSecrets) {
        const secretBigInt = BigInt("0x" + voter.secret);
        const leaf = F.toObject(poseidon([secretBigInt]));
        
        voterLeaves.push({
            id: voter.id,
            leaf: leaf.toString(),
            leafHex: "0x" + leaf.toString(16).padStart(64, '0')
        });
        
        console.log(`  Voter ${voter.id}: leaf = ${voterLeaves[voter.id-1].leafHex}`);
    }
    
    // Step 3: Generate voter credentials file (each voter has their own - secrets kept private)
    const credentialsFile = {
        description: "Voter credentials - EACH VOTER KEEPS THIS PRIVATE (secret only)",
        electionId: electionId,
        voters: voterSecrets.map(v => ({
            id: v.id,
            secret: v.secret
        }))
    };
    
    fs.writeFileSync("./voter-secrets.json", JSON.stringify(credentialsFile, null, 2));
    console.log("\n--- OUTPUT: voter-secrets.json (voters keep this private) ---");
    console.log("  File saved - contains ONLY secrets");
    console.log("  In production: each voter keeps their own secret, never shares with admin");
    
    // Step 4: Generate public voter list (admin sees this - leaves only, no secrets)
    const publicVoterList = {
        description: "Eligible voters list - ADMIN SEES THIS (identity + leaf only, NO secret)",
        electionId: electionId,
        voters: voterLeaves.map(v => ({
            id: v.id,
            name: `Voter ${v.id}`,
            leaf: v.leafHex
        }))
    };
    
    fs.writeFileSync("./voters.json", JSON.stringify(publicVoterList, null, 2));
    console.log("\n--- OUTPUT: voters.json (admin sees this) ---");
    console.log("  File saved - contains ONLY leaf hashes, NO secrets");
    console.log("  Admin can verify voter eligibility without knowing their secret");
    
    console.log("\n=== REGISTRATION COMPLETE ===");
    console.log("Summary:");
    console.log("  - voter-secrets.json: Contains secrets (VOTER KEEPS PRIVATE)");
    console.log("  - voters.json: Contains leaf hashes (ADMIN SEES THIS)");
    console.log("  - Admin NEVER sees voter secrets");
    
    return {
        voterSecrets,
        voterLeaves
    };
}

if (require.main === module) {
    registerVoters()
        .then(() => {
            console.log("\nDone!");
            process.exit(0);
        })
        .catch(err => {
            console.error("Error:", err);
            process.exit(1);
        });
}

module.exports = { registerVoters };
