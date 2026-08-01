/**
 * verifySepolia.js — re-check that every transaction in sepolia-reference.json
 * is still on the public chain and still says what the file claims.
 *
 * Run this before a viva. A stale or wrong Etherscan link on the projector is
 * worse than no link at all, and this is the cheap way to be sure:
 *
 *   node demo/tools/verifySepolia.js
 *
 * Reads ALCHEMY_URL from .env. Sends nothing and costs nothing.
 */

const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const REF = path.join(__dirname, "..", "sepolia-reference.json");
const ARTIFACT = path.join(__dirname, "..", "..", "artifacts", "contracts",
    "VotingRollupV2.sol", "VotingRollupV2.json");

async function main() {
    if (!process.env.ALCHEMY_URL) {
        console.error("ALCHEMY_URL is not set in .env — cannot reach Sepolia.");
        process.exit(1);
    }

    const ref = JSON.parse(fs.readFileSync(REF, "utf8"));
    const iface = new ethers.Interface(JSON.parse(fs.readFileSync(ARTIFACT, "utf8")).abi);
    const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL, 11155111, { staticNetwork: true });

    console.log(`\nVerifying ${ref.transactions.length} reference transaction(s) on Sepolia\n`);

    let failures = 0;

    for (const t of ref.transactions) {
        const problems = [];

        const tx = await provider.getTransaction(t.hash);
        if (!tx) {
            console.log(`  ✗ ${t.label}\n      transaction not found on chain`);
            failures++;
            continue;
        }

        const receipt = await provider.getTransactionReceipt(t.hash);

        if (tx.blockNumber !== t.block) problems.push(`block ${tx.blockNumber} ≠ ${t.block}`);
        if (Number(receipt.gasUsed) !== t.gasUsed) problems.push(`gas ${receipt.gasUsed} ≠ ${t.gasUsed}`);
        if ((tx.data.length - 2) / 2 !== t.calldataBytes) problems.push(`calldata ${(tx.data.length - 2) / 2} ≠ ${t.calldataBytes}`);
        if (receipt.status !== 1) problems.push("transaction reverted on chain");

        if (t.method !== "constructor") {
            try {
                const parsed = iface.parseTransaction({ data: tx.data });
                if (!parsed || parsed.name !== t.method) {
                    problems.push(`method ${parsed ? parsed.name : "undecodable"} ≠ ${t.method}`);
                } else if (t.method === "submitBatch") {
                    if (parsed.args[5].length !== t.nullifiersSubmitted) {
                        problems.push(`nullifiers ${parsed.args[5].length} ≠ ${t.nullifiersSubmitted}`);
                    }
                    if (parsed.args[3].toString() !== t.postStateRoot) {
                        problems.push("postStateRoot does not match");
                    }
                }
            } catch (err) {
                problems.push(`could not decode calldata: ${err.message}`);
            }
        }

        if (problems.length) {
            console.log(`  ✗ ${t.label}`);
            problems.forEach(p => console.log(`      ${p}`));
            failures++;
        } else {
            console.log(`  ✓ ${t.label}  —  block ${t.block}, ${t.gasUsed.toLocaleString()} gas`);
            console.log(`      ${ref.explorerBase}/tx/${t.hash}`);
        }
    }

    const state = await new ethers.Contract(ref.votingRollupV2, iface.fragments, provider).getState();
    console.log(`\n  contract state: batchCount=${state[3]}, votingActive=${state[4]}`);

    console.log(failures ? `\n${failures} reference(s) FAILED verification\n` : "\nAll references verified.\n");
    process.exit(failures ? 1 : 0);
}

main().catch(err => {
    console.error("\nFailed:", err.message);
    process.exit(1);
});
