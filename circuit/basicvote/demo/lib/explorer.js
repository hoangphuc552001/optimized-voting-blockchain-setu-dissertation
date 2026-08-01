const { ethers } = require("ethers");

/**
 * explorer.js — an Etherscan-shaped view of the demo's local chain.
 *
 * The point is not to reimplement Etherscan. It is to answer the question an
 * examiner will actually ask: *"you say the ballot is private — show me what is
 * on the chain."* So alongside the usual block/transaction/address views, every
 * decoded transaction carries a `reveals` section that separates what a public
 * observer genuinely learns from what stays hidden.
 *
 * Everything here reads from the node through eth_* RPC only. Nothing consults
 * the operator's memory — an external observer could reproduce all of it.
 */

const MAX_LOG_ARG = 3;

function label(chain, address) {
    if (!address) return { address: null, label: "contract creation", role: "create" };
    const hit = chain.registry && chain.registry.get(address.toLowerCase());
    if (hit) return { address, label: hit.label, role: hit.role };

    const known = {
        [String(chain.adminAddress).toLowerCase()]: "Operator / admin EOA",
        [String(chain.attackerAddress).toLowerCase()]: "Unauthorised EOA"
    };
    return { address, label: known[address.toLowerCase()] || "EOA", role: "eoa" };
}

/**
 * Recent blocks, newest first.
 *
 * On a local node every block belongs to the demo, so walking back from the
 * head is both cheap and entirely relevant. On Sepolia it is neither — the
 * chain is full of other people's traffic and each block is a separate RPC
 * round-trip — so there we walk the demo's own transactions instead.
 */
async function blocks(chain, limit = 12) {
    if (chain.network === "sepolia") {
        const seen = new Map();
        for (const t of [...chain.sentTxs].reverse()) {
            if (!t.blockNumber || seen.has(t.blockNumber)) continue;
            if (seen.size >= limit) break;
            seen.set(t.blockNumber, null);
        }
        const out = [];
        for (const n of seen.keys()) {
            const b = await chain.provider.getBlock(n);
            if (!b) continue;
            out.push({
                number: b.number,
                hash: b.hash,
                timestamp: b.timestamp,
                txCount: b.transactions.length,
                gasUsed: Number(b.gasUsed),
                gasLimit: Number(b.gasLimit),
                transactions: b.transactions,
                url: chain.explorerBase ? `${chain.explorerBase}/block/${b.number}` : null,
                isElectionBlock: true
            });
        }
        return out;
    }

    const head = await chain.provider.getBlockNumber();
    const out = [];

    for (let n = head; n >= 0 && out.length < limit; n--) {
        const b = await chain.provider.getBlock(n);
        if (!b) continue;
        out.push({
            number: b.number,
            hash: b.hash,
            timestamp: b.timestamp,
            txCount: b.transactions.length,
            gasUsed: Number(b.gasUsed),
            gasLimit: Number(b.gasLimit),
            transactions: b.transactions,
            url: null,
            isElectionBlock: chain.deployBlock !== undefined && b.number >= chain.deployBlock
        });
    }
    return out;
}

/** A compact transaction list for the explorer's left column. */
async function recentTransactions(chain, limit = 15) {
    const out = [];

    if (chain.network === "sepolia") {
        for (const t of [...chain.sentTxs].reverse().slice(0, limit)) {
            const tx = await chain.provider.getTransaction(t.hash);
            if (!tx) continue;
            out.push({
                hash: t.hash,
                blockNumber: tx.blockNumber,
                timestamp: null,
                from: tx.from,
                to: tx.to,
                toLabel: label(chain, tx.to).label,
                method: decodeMethodName(chain, tx),
                calldataBytes: (tx.data.length - 2) / 2,
                url: chain.txUrl(t.hash)
            });
        }
        return out;
    }

    const bs = await blocks(chain, 40);

    for (const b of bs) {
        for (const hash of b.transactions) {
            if (out.length >= limit) return out;
            const tx = await chain.provider.getTransaction(hash);
            if (!tx) continue;
            const to = label(chain, tx.to);
            out.push({
                hash,
                blockNumber: b.number,
                timestamp: b.timestamp,
                from: tx.from,
                to: tx.to,
                toLabel: to.label,
                method: decodeMethodName(chain, tx),
                calldataBytes: (tx.data.length - 2) / 2,
                url: null
            });
        }
    }
    return out;
}

function decodeMethodName(chain, tx) {
    if (!tx.to) return "deploy";
    const hit = chain.registry && chain.registry.get(tx.to.toLowerCase());
    if (!hit || tx.data === "0x") return tx.data === "0x" ? "transfer" : "unknown";
    try {
        const parsed = hit.iface.parseTransaction({ data: tx.data });
        return parsed ? parsed.name : "unknown";
    } catch {
        return "unknown";
    }
}

/** Full Etherscan-style detail for one transaction. */
async function transaction(chain, hash) {
    const tx = await chain.provider.getTransaction(hash);
    if (!tx) throw new Error(`Transaction ${hash} not found`);

    const receipt = await chain.provider.getTransactionReceipt(hash);
    const block = await chain.provider.getBlock(tx.blockNumber);
    const to = label(chain, tx.to);
    const from = label(chain, tx.from);

    const gasUsed = receipt ? Number(receipt.gasUsed) : null;
    const gasPrice = receipt && receipt.gasPrice ? receipt.gasPrice : tx.gasPrice;
    const feeWei = gasUsed && gasPrice ? BigInt(gasUsed) * BigInt(gasPrice) : null;

    const detail = {
        hash: tx.hash,
        url: chain.txUrl(tx.hash),
        network: chain.network,
        confirmations: block ? Math.max(0, (await chain.provider.getBlockNumber()) - block.number + 1) : 0,
        status: receipt ? (receipt.status === 1 ? "Success" : "Reverted") : "Pending",
        blockNumber: tx.blockNumber,
        timestamp: block ? block.timestamp : null,
        from: tx.from,
        fromLabel: from.label,
        to: tx.to,
        toLabel: to.label,
        nonce: tx.nonce,
        value: tx.value ? ethers.formatEther(tx.value) : "0.0",
        gasLimit: Number(tx.gasLimit),
        gasUsed,
        gasPriceGwei: gasPrice ? Number(ethers.formatUnits(gasPrice, "gwei")).toFixed(4) : null,
        feeEth: feeWei !== null ? ethers.formatEther(feeWei) : null,
        calldataBytes: (tx.data.length - 2) / 2,
        calldataHex: tx.data,
        method: null,
        inputDecoded: [],
        logs: [],
        reveals: null
    };

    const hit = tx.to && chain.registry ? chain.registry.get(tx.to.toLowerCase()) : null;

    if (hit && tx.data && tx.data !== "0x") {
        try {
            const parsed = hit.iface.parseTransaction({ data: tx.data });
            if (parsed) {
                detail.method = {
                    name: parsed.name,
                    signature: parsed.fragment.format("sighash"),
                    selector: tx.data.slice(0, 10)
                };
                detail.inputDecoded = parsed.fragment.inputs.map((inp, i) =>
                    describeArg(inp.name || `arg${i}`, inp, parsed.args[i]));
            }
        } catch {
            // Unknown selector — leave the raw calldata visible and move on.
        }
    }

    if (receipt) {
        for (const log of receipt.logs) {
            const lh = chain.registry ? chain.registry.get(log.address.toLowerCase()) : null;
            let entry = {
                address: log.address,
                addressLabel: lh ? lh.label : "unknown contract",
                name: null,
                args: [],
                topics: log.topics
            };
            if (lh) {
                try {
                    const parsed = lh.iface.parseLog(log);
                    if (parsed) {
                        entry.name = parsed.name;
                        entry.args = parsed.fragment.inputs.map((inp, i) => ({
                            name: inp.name || `arg${i}`,
                            type: inp.type,
                            value: stringify(parsed.args[i])
                        }));
                    }
                } catch { /* undecodable log */ }
            }
            detail.logs.push(entry);
        }
    }

    detail.reveals = whatThisReveals(detail);
    return detail;
}

/** Render one decoded calldata argument, summarising the big arrays. */
function describeArg(name, input, value) {
    const type = input.type;

    if (Array.isArray(value)) {
        const flat = flatten(value);
        return {
            name,
            type,
            summary: `${value.length} element(s)`,
            values: flat.slice(0, 24).map(stringify),
            truncated: flat.length > 24,
            totalValues: flat.length
        };
    }

    return { name, type, summary: null, values: [stringify(value)], truncated: false, totalValues: 1 };
}

function flatten(v) {
    if (!Array.isArray(v)) return [v];
    return v.flatMap(flatten);
}

function stringify(v) {
    if (typeof v === "bigint") return v.toString();
    if (Array.isArray(v)) return v.map(stringify);
    if (v && typeof v === "object" && typeof v.toString === "function") return v.toString();
    return String(v);
}

/**
 * The thesis payload: separate what this transaction genuinely discloses from
 * what it does not. Written per-method because the answer is method-specific —
 * the per-vote ZK baseline leaks strictly more than a rollup batch, and the
 * non-ZK baseline leaks everything.
 */
function whatThisReveals(d) {
    const name = d.method && d.method.name;

    if (name === "submitBatch") {
        const nullifiers = d.inputDecoded.find(a => a.name === "nullifierList");
        const spotSignals = d.inputDecoded.find(a => a.name === "votePublicSignals");
        const spotCount = spotSignals ? spotSignals.totalValues / 5 : 0;

        const disclosed = [
            "The batch proof — 8 field elements. Reveals nothing about its witness.",
            "preStateRoot and postStateRoot — commitments to the tally, not the tally itself.",
            "batchNullifierHash — a Poseidon commitment over the batch's nullifier set.",
            `${nullifiers ? nullifiers.totalValues : 0} nullifier hash(es) — one per counted ballot, each an unlinkable pseudonym.`
        ];
        if (spotCount > 0) {
            disclosed.push(
                `The (candidate, vote) pair of ${spotCount} spot-checked ballot(s), in the clear — ` +
                `still not linked to any voter, but no longer hidden.`
            );
        }

        return {
            headline: "A rollup batch",
            disclosed,
            hidden: [
                "Which registered voter produced any nullifier.",
                "Any voter's secret, or their position in the eligibility tree.",
                spotCount > 0
                    ? "The (candidate, vote) of every ballot that was not spot-checked — those are private circuit inputs."
                    : "The (candidate, vote) of every ballot — all are private circuit inputs.",
                "Whether any particular registered voter participated at all."
            ],
            note: spotCount > 0
                ? `Spot-checking is a cost/assurance dial with a privacy cost: each sampled proof publishes its ballot. At ${spotCount} of the batch, that is the trade being made.`
                : "With spot-checking disabled, no individual ballot content reaches the chain."
        };
    }

    if (name === "castBallot" && d.toLabel.startsWith("PerVoteZKBallot")) {
        return {
            headline: "Per-vote ZK baseline (RQ3 comparator)",
            disclosed: [
                "One Groth16 proof per ballot.",
                "This ballot's nullifier — an unlinkable pseudonym.",
                "This ballot's candidate and vote, in the clear, as public signals."
            ],
            hidden: [
                "Which registered voter cast it.",
                "The voter's secret and tree position."
            ],
            note: "Privacy is comparable to the rollup, but every ballot is its own transaction — so the timing and gas of each vote is individually observable, and the cost is ~4× per vote."
        };
    }

    if (name === "castBallot" && d.toLabel.startsWith("PlainBallot")) {
        return {
            headline: "Non-ZK baseline (RQ3 comparator)",
            disclosed: [
                "The voter identifier, the candidate, and the vote — all in the clear.",
                "A complete, permanent, public record of who voted for whom."
            ],
            hidden: ["Nothing."],
            note: "This is the cheapest possible on-chain design and the reason the other two exist."
        };
    }

    if (name === "endVoting") {
        return {
            headline: "Election lifecycle",
            disclosed: ["The election is closed and the final state root is fixed."],
            hidden: ["The tally is still only committed to, not published, by the state root."],
            note: null
        };
    }

    if (!d.to) {
        return {
            headline: "Contract deployment",
            disclosed: ["The contract bytecode, and the constructor arguments — including the public voter Merkle root and election ID."],
            hidden: ["The eligibility tree's leaves are commitments; the root alone does not enumerate the voters."],
            note: null
        };
    }

    return null;
}

/** Address view: code size, balance, and — for known contracts — live state. */
async function address(chain, addr) {
    const meta = label(chain, addr);
    const [code, balance, txCount] = await Promise.all([
        chain.provider.getCode(addr),
        chain.provider.getBalance(addr),
        chain.provider.getTransactionCount(addr)
    ]);

    const out = {
        address: addr,
        url: chain.addressUrl(addr),
        label: meta.label,
        role: meta.role,
        isContract: code !== "0x",
        bytecodeBytes: (code.length - 2) / 2,
        balanceEth: ethers.formatEther(balance),
        txCount,
        state: null
    };

    if (addr.toLowerCase() === String(chain.addresses.votingRollupV2).toLowerCase()) {
        const s = await chain.getState();
        out.state = {
            stateRoot: s.stateRoot,
            voterMerkleRoot: s.voterMerkleRoot,
            electionId: s.electionId,
            batchCount: s.batchCount,
            votingActive: s.votingActive
        };
    }

    return out;
}

module.exports = { blocks, recentTransactions, transaction, address };
