const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function artifact(file, name) {
    const p = path.join(ROOT, "artifacts", "contracts", file, `${name}.json`);
    if (!fs.existsSync(p)) {
        throw new Error(`Artifact not found: ${p}\nRun: npx hardhat compile`);
    }
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Format a snarkjs Groth16 proof for the EVM verifier (pi_b inner pairs are swapped). */
function toCalldata(proof) {
    return {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]]
        ],
        c: [proof.pi_c[0], proof.pi_c[1]]
    };
}

/**
 * Chain — thin ethers wrapper around the demo's on-chain half.
 *
 * Deploys a fresh election on every reset so the demo is repeatable: the same
 * sequence of UI actions always produces the same state roots and gas figures.
 */
class Chain {
    constructor(rpcUrl, network = "local") {
        this.rpcUrl = rpcUrl;
        this.network = network;              // "local" | "sepolia"
        this.provider = null;
        this.admin = null;
        this.attacker = null;
        this.contracts = {};
        this.addresses = {};
        this.sentTxs = [];                   // every tx this demo submitted, newest last
    }

    /** `https://sepolia.etherscan.io`, or null when there is no public explorer. */
    get explorerBase() {
        return this.network === "sepolia" ? "https://sepolia.etherscan.io" : null;
    }

    txUrl(hash) {
        return this.explorerBase ? `${this.explorerBase}/tx/${hash}` : null;
    }

    addressUrl(addr) {
        return this.explorerBase ? `${this.explorerBase}/address/${addr}` : null;
    }

    /** Record a transaction so the demo can list its own activity without scanning the chain. */
    track(hash, method, extra = {}) {
        this.sentTxs.push({ hash, method, at: Date.now(), url: this.txUrl(hash), ...extra });
        if (this.sentTxs.length > 200) this.sentTxs.shift();
        return hash;
    }

    /**
     * Local: try the usual hardhat ports.
     * Sepolia: use ALCHEMY_URL + PRIVATE_KEY from .env.
     *
     * On Sepolia there is exactly one funded account, so the "unauthorised
     * caller" scenarios are simulated with eth_call from an unfunded address
     * instead of being broadcast — they produce the same revert reason without
     * spending testnet ETH or waiting for a block. See endVoting().
     */
    static async connect({ network = "local", rpcUrl, privateKey } = {}) {
        if (network === "sepolia") {
            if (!rpcUrl) throw new Error("Sepolia mode needs ALCHEMY_URL in .env");
            if (!privateKey) throw new Error("Sepolia mode needs PRIVATE_KEY in .env");

            const provider = new ethers.JsonRpcProvider(rpcUrl, 11155111, { staticNetwork: true });
            const net = await provider.getNetwork();
            if (Number(net.chainId) !== 11155111) {
                throw new Error(`ALCHEMY_URL points at chainId ${net.chainId}, expected 11155111 (Sepolia)`);
            }

            const chain = new Chain(rpcUrl, "sepolia");
            chain.provider = provider;
            chain.admin = new ethers.Wallet(privateKey, provider);
            chain.adminAddress = await chain.admin.getAddress();
            // No second funded key exists; this address is only ever used as a
            // `from` for eth_call, so it never needs a balance.
            chain.attacker = null;
            chain.attackerAddress = "0x000000000000000000000000000000000000dEaD";
            chain.chainId = 11155111;
            chain.balance = await provider.getBalance(chain.adminAddress);
            return chain;
        }

        for (const url of ["http://127.0.0.1:8545", "http://127.0.0.1:8547"]) {
            try {
                const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
                const net = await provider.getNetwork();
                const chain = new Chain(url, "local");
                chain.provider = provider;
                chain.admin = await provider.getSigner(0);
                chain.attacker = await provider.getSigner(1);
                chain.adminAddress = await chain.admin.getAddress();
                chain.attackerAddress = await chain.attacker.getAddress();
                chain.chainId = Number(net.chainId);
                return chain;
            } catch (err) {
                // try the next candidate
            }
        }
        throw new Error(
            "No local Ethereum node found on 8545 or 8547.\n" +
            "Start one first:  npx hardhat node"
        );
    }

    /**
     * Attach to an already-deployed election instead of redeploying.
     *
     * Refuses if the contract is not in its initial state: the operator's state
     * tree starts empty, so a contract whose stateRoot has already advanced
     * would make every batch proof fail on `preStateRoot`. Better to say so at
     * start-up than to fail confusingly mid-demo.
     */
    async attachElection(addresses, { expectedStateRoot, expectedVoterRoot }) {
        const rollupArt = artifact("VotingRollupV2.sol", "VotingRollupV2");
        const voteVerifierArt = artifact("VoteVerifier.sol", "Groth16Verifier");
        const batchVerifierArt = artifact("BatchStateVerifier.sol", "Groth16Verifier");
        const perVoteArt = artifact("DemoBaselines.sol", "PerVoteZKBallot");
        const plainArt = artifact("DemoBaselines.sol", "PlainBallot");

        const at = (art, addr) => new ethers.Contract(addr, art.abi, this.admin);

        const rollup = at(rollupArt, addresses.votingRollupV2);
        const state = await rollup.getState();

        const problems = [];
        if (state[1].toString() !== String(expectedVoterRoot)) {
            problems.push(
                `voterMerkleRoot on chain (${state[1]}) does not match merkleProofs.json (${expectedVoterRoot})`
            );
        }
        if (state[0].toString() !== String(expectedStateRoot)) {
            problems.push(
                `stateRoot has already advanced (batchCount=${state[3]}). ` +
                `The operator's tally tree starts empty, so proofs would not line up.`
            );
        }
        if (!state[4]) problems.push("voting has already ended on this contract");

        if (problems.length) {
            throw new Error(
                `Cannot reuse the deployed Sepolia election:\n  - ${problems.join("\n  - ")}\n\n` +
                `Deploy a fresh one instead:  SEPOLIA_DEPLOY=1 npm run demo:sepolia`
            );
        }

        this.contracts = {
            rollup,
            voteVerifier: at(voteVerifierArt, addresses.voteVerifier),
            batchVerifier: at(batchVerifierArt, addresses.batchStateVerifier),
            perVoteZK: addresses.perVoteZKBallot ? at(perVoteArt, addresses.perVoteZKBallot) : null,
            plain: addresses.plainBallot ? at(plainArt, addresses.plainBallot) : null
        };
        this.abis = { rollup: rollupArt.abi };
        this.addresses = {
            voteVerifier: addresses.voteVerifier,
            batchStateVerifier: addresses.batchStateVerifier,
            votingRollupV2: addresses.votingRollupV2,
            ...(addresses.perVoteZKBallot ? { perVoteZKBallot: addresses.perVoteZKBallot } : {}),
            ...(addresses.plainBallot ? { plainBallot: addresses.plainBallot } : {})
        };
        this.spotCheckCount = Number(await rollup.spotCheckCount());

        this._buildRegistry({ rollupArt, voteVerifierArt, batchVerifierArt, perVoteArt, plainArt });
        this.deployBlock = await this.provider.getBlockNumber();

        return this.addresses;
    }

    async deployElection({ initialStateRoot, voterMerkleRoot, electionId, spotCheckCount }) {
        const deploy = async (art, args, signer = this.admin) => {
            const factory = new ethers.ContractFactory(art.abi, art.bytecode, signer);
            const c = await factory.deploy(...args);
            await c.waitForDeployment();
            return c;
        };

        const voteVerifierArt = artifact("VoteVerifier.sol", "Groth16Verifier");
        const batchVerifierArt = artifact("BatchStateVerifier.sol", "Groth16Verifier");
        const rollupArt = artifact("VotingRollupV2.sol", "VotingRollupV2");
        const perVoteArt = artifact("DemoBaselines.sol", "PerVoteZKBallot");
        const plainArt = artifact("DemoBaselines.sol", "PlainBallot");

        const voteVerifier = await deploy(voteVerifierArt, []);
        const batchVerifier = await deploy(batchVerifierArt, []);

        const rollup = await deploy(rollupArt, [
            await voteVerifier.getAddress(),
            await batchVerifier.getAddress(),
            initialStateRoot,
            voterMerkleRoot,
            electionId,
            spotCheckCount
        ]);

        const perVoteZK = await deploy(perVoteArt, [
            await voteVerifier.getAddress(),
            voterMerkleRoot,
            electionId
        ]);

        const plain = await deploy(plainArt, [electionId]);

        this.contracts = { voteVerifier, batchVerifier, rollup, perVoteZK, plain };
        this.abis = { rollup: rollupArt.abi };
        this.addresses = {
            voteVerifier: await voteVerifier.getAddress(),
            batchStateVerifier: await batchVerifier.getAddress(),
            votingRollupV2: await rollup.getAddress(),
            perVoteZKBallot: await perVoteZK.getAddress(),
            plainBallot: await plain.getAddress()
        };

        this.spotCheckCount = spotCheckCount;
        this._buildRegistry({ rollupArt, voteVerifierArt, batchVerifierArt, perVoteArt, plainArt });
        this.deployBlock = await this.provider.getBlockNumber();

        return this.addresses;
    }

    /**
     * Explorer registry: address → { label, iface }, so raw calldata and raw
     * logs can be decoded into something an audience can read.
     */
    _buildRegistry({ rollupArt, voteVerifierArt, batchVerifierArt, perVoteArt, plainArt }) {
        this.registry = new Map();
        const register = (addr, label, abi, role) => {
            if (!addr) return;
            this.registry.set(addr.toLowerCase(), { label, role, iface: new ethers.Interface(abi) });
        };

        register(this.addresses.votingRollupV2, "VotingRollupV2", rollupArt.abi, "rollup");
        register(this.addresses.voteVerifier, "Groth16Verifier (VoteProof)", voteVerifierArt.abi, "verifier");
        register(this.addresses.batchStateVerifier, "Groth16Verifier (BatchStateUpdate)", batchVerifierArt.abi, "verifier");
        register(this.addresses.perVoteZKBallot, "PerVoteZKBallot (RQ3 baseline)", perVoteArt.abi, "baseline");
        register(this.addresses.plainBallot, "PlainBallot (RQ3 baseline)", plainArt.abi, "baseline");
    }

    async getState() {
        const s = await this.contracts.rollup.getState();
        return {
            stateRoot: s[0].toString(),
            voterMerkleRoot: s[1].toString(),
            electionId: s[2].toString(),
            batchCount: Number(s[3]),
            votingActive: s[4]
        };
    }

    async isNullifierUsed(n) {
        return this.contracts.rollup.isNullifierUsed(BigInt(n));
    }

    /**
     * Submit a batch. Returns { ok, txHash, gasUsed, blockNumber } or
     * { ok:false, revert } with the contract's revert string when it is rejected.
     */
    async submitBatch({ batchProof, newStateRoot, batchNullifierHash, nullifierList, voteProofs, spotCheckCount }) {
        const b = toCalldata(batchProof);

        const spot = Math.min(spotCheckCount, voteProofs.length);
        const voteA = [];
        const voteB = [];
        const voteC = [];
        const votePublic = [];
        for (let i = 0; i < spot; i++) {
            const f = toCalldata(voteProofs[i].proof);
            voteA.push(f.a);
            voteB.push(f.b);
            voteC.push(f.c);
            votePublic.push(voteProofs[i].publicSignals.map(s => BigInt(s)));
        }

        try {
            const tx = await this.contracts.rollup.submitBatch(
                b.a, b.b, b.c,
                BigInt(newStateRoot),
                BigInt(batchNullifierHash),
                nullifierList.map(n => BigInt(n)),
                voteA, voteB, voteC, votePublic
            );
            const receipt = await tx.wait();
            this.track(tx.hash, "submitBatch", { blockNumber: receipt.blockNumber });
            return {
                ok: true,
                txHash: tx.hash,
                txUrl: this.txUrl(tx.hash),
                gasUsed: Number(receipt.gasUsed),
                blockNumber: receipt.blockNumber,
                spotChecked: spot
            };
        } catch (err) {
            const rejected = this._rejection(err);
            return { ...rejected, spotChecked: spot };
        }
    }

    /** Baseline A: one Groth16 verification per ballot on L1. */
    async castPerVoteZK(voteProof) {
        if (!this.contracts.perVoteZK) return { ok: false, revert: "PerVoteZKBallot not deployed on this network" };
        const f = toCalldata(voteProof.proof);
        try {
            const tx = await this.contracts.perVoteZK.castBallot(
                f.a, f.b, f.c,
                voteProof.publicSignals.map(s => BigInt(s))
            );
            const receipt = await tx.wait();
            this.track(tx.hash, "castBallot (per-vote ZK)", { blockNumber: receipt.blockNumber });
            return { ok: true, gasUsed: Number(receipt.gasUsed), txHash: tx.hash, txUrl: this.txUrl(tx.hash) };
        } catch (err) {
            return this._rejection(err);
        }
    }

    /** Baseline B: no ZK at all — the ballot is public. */
    async castPlain(voterId, candidate, vote) {
        if (!this.contracts.plain) return { ok: false, revert: "PlainBallot not deployed on this network" };
        try {
            const tx = await this.contracts.plain.castBallot(voterId, candidate, vote);
            const receipt = await tx.wait();
            this.track(tx.hash, "castBallot (non-ZK)", { blockNumber: receipt.blockNumber });
            return { ok: true, gasUsed: Number(receipt.gasUsed), txHash: tx.hash, txUrl: this.txUrl(tx.hash) };
        } catch (err) {
            return this._rejection(err);
        }
    }

    /**
     * On Sepolia the unauthorised-caller case is simulated with eth_call rather
     * than broadcast: there is only one funded key, and a transaction that is
     * going to revert still costs gas and a block of waiting. The revert reason
     * returned is identical — it comes from the same `require`.
     */
    async endVoting({ asAttacker = false } = {}) {
        try {
            if (asAttacker && this.network === "sepolia") {
                await this.contracts.rollup.endVoting.staticCall({ from: this.attackerAddress });
                return { ok: true, simulated: true, note: "eth_call from an unauthorised address did NOT revert" };
            }
            if (asAttacker) {
                const tx = await this.contracts.rollup.connect(this.attacker).endVoting();
                const receipt = await tx.wait();
                this.track(tx.hash, "endVoting (unauthorised)", { blockNumber: receipt.blockNumber });
                return { ok: true, txHash: tx.hash, txUrl: this.txUrl(tx.hash), gasUsed: Number(receipt.gasUsed) };
            }

            const tx = await this.contracts.rollup.endVoting();
            const receipt = await tx.wait();
            this.track(tx.hash, "endVoting", { blockNumber: receipt.blockNumber });
            return { ok: true, txHash: tx.hash, txUrl: this.txUrl(tx.hash), gasUsed: Number(receipt.gasUsed) };
        } catch (err) {
            return { ...this._rejection(err), simulated: asAttacker && this.network === "sepolia" };
        }
    }

    /**
     * Distinguish "the contract rejected this" from "the transaction never got
     * that far". On a public network a submission can also fail for reasons
     * that have nothing to do with the protocol — no funds, nonce clash, RPC
     * timeout — and reporting those as a protocol revert would be a lie.
     */
    _rejection(err) {
        const revert = decodeRevert(err);
        const infra = /insufficient funds|nonce|replacement|timeout|rate limit|could not coalesce|network/i.test(revert);
        return {
            ok: false,
            revert,
            infrastructure: infra,
            txHash: err && err.transaction && err.transaction.hash ? err.transaction.hash : null
        };
    }

    /**
     * Attack 16: deploying with a zero verifier address must revert in the
     * constructor. On Sepolia this is estimated rather than broadcast — a
     * failed deployment would still cost real testnet ETH, and estimateGas
     * surfaces the same constructor revert.
     */
    async tryDeployZeroVerifier({ initialStateRoot, voterMerkleRoot, electionId }) {
        const art = artifact("VotingRollupV2.sol", "VotingRollupV2");
        const factory = new ethers.ContractFactory(art.abi, art.bytecode, this.admin);
        const args = [
            ethers.ZeroAddress,
            this.addresses.batchStateVerifier,
            initialStateRoot,
            voterMerkleRoot,
            electionId,
            0
        ];

        try {
            if (this.network === "sepolia") {
                const tx = await factory.getDeployTransaction(...args);
                await this.provider.estimateGas({ ...tx, from: this.adminAddress });
                return { ok: true, simulated: true, note: "constructor did NOT revert" };
            }
            const c = await factory.deploy(...args);
            await c.waitForDeployment();
            return { ok: true, address: await c.getAddress() };
        } catch (err) {
            return { ...this._rejection(err), simulated: this.network === "sepolia" };
        }
    }

    /**
     * External-observer path: pull the raw calldata for a submitted batch back out
     * of the chain and decode it, so the UI can re-verify without trusting the
     * operator's in-memory copy of anything.
     */
    async getBatchCalldata(txHash) {
        const tx = await this.provider.getTransaction(txHash);
        if (!tx) throw new Error("Transaction not found on chain");
        const iface = new ethers.Interface(this.abis.rollup);
        const parsed = iface.parseTransaction({ data: tx.data });

        const [a, b, c, newStateRoot, batchNullifierHash] = parsed.args;

        // Undo the EVM pi_b swap to get back a snarkjs-shaped proof.
        const proof = {
            pi_a: [a[0].toString(), a[1].toString(), "1"],
            pi_b: [
                [b[0][1].toString(), b[0][0].toString()],
                [b[1][1].toString(), b[1][0].toString()],
                ["1", "0"]
            ],
            pi_c: [c[0].toString(), c[1].toString(), "1"],
            protocol: "groth16",
            curve: "bn128"
        };

        return {
            proof,
            newStateRoot: newStateRoot.toString(),
            batchNullifierHash: batchNullifierHash.toString(),
            blockNumber: tx.blockNumber,
            from: tx.from,
            calldataBytes: (tx.data.length - 2) / 2
        };
    }

    async getPreStateRootAt(txHash) {
        const tx = await this.provider.getTransaction(txHash);
        const iface = new ethers.Interface(this.abis.rollup);
        const logs = await this.provider.getLogs({
            address: this.addresses.votingRollupV2,
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });
        for (const log of logs) {
            const parsed = iface.parseLog(log);
            if (parsed && parsed.name === "BatchSubmitted") {
                return {
                    batchIndex: Number(parsed.args[0]),
                    preStateRoot: parsed.args[1].toString(),
                    postStateRoot: parsed.args[2].toString(),
                    voteCount: Number(parsed.args[3])
                };
            }
        }
        return null;
    }
}

/** Pull a human-readable reason out of whatever ethers/hardhat threw. */
function decodeRevert(err) {
    const candidates = [
        err?.reason,
        err?.shortMessage,
        err?.info?.error?.message,
        err?.error?.message,
        err?.message
    ].filter(Boolean);

    for (const c of candidates) {
        const m = /reverted with reason string ['"]([^'"]+)['"]/.exec(c) ||
                  /execution reverted:?\s*"?([^"\n]+)"?/.exec(c);
        if (m) return m[1].trim();
    }
    return candidates[0] || "unknown revert";
}

module.exports = { Chain, toCalldata, decodeRevert };
