const { expect } = require("chai");
const { ethers } = require("hardhat");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

const BENCHMARK_OUTPUT_DIR = path.join(__dirname, "..", "output");
const CSV_OUTPUT_PATH = path.join(BENCHMARK_OUTPUT_DIR, "gas_benchmark.csv");
const ALL_BATCH_SIZES = [
    1, 4, 10, 25, 50, 100, 500, 600, 700, 800, 1000, 5000, 10000,
    50000, 100000, 500000, 1000000
];

describe("VotingRollup", function () {
    let votingRollup;
    let mockVerifier;
    let owner;
    let poseidon;
    let F;
    let initialStateRoot;
    let voterMerkleRoot;
    let electionId;

    async function computeEmptyStateRoot(poseidon, F, levels) {
        const numLeaves = 2 ** levels;
        const leaves = new Array(numLeaves).fill(0n);

        let currentLevel = leaves.map(v => F.toObject(poseidon([v])));
        for (let level = 0; level < levels; level++) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : 0n;
                nextLevel.push(F.toObject(poseidon([left, right])));
            }
            currentLevel = nextLevel;
        }
        return currentLevel[0];
    }

    before(async function () {
        poseidon = await buildPoseidon();
        F = poseidon.F;
    });

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        initialStateRoot = await computeEmptyStateRoot(poseidon, F, 5);
        voterMerkleRoot = F.toObject(poseidon([1n, 2n, 3n]));
        electionId = 1;

        const MockVerifier = await ethers.getContractFactory("MockBatchVerifier");
        mockVerifier = await MockVerifier.deploy();
        await mockVerifier.waitForDeployment();

        const VotingRollup = await ethers.getContractFactory("VotingRollup");
        votingRollup = await VotingRollup.deploy(
            await mockVerifier.getAddress(),
            initialStateRoot,
            voterMerkleRoot,
            electionId
        );
        await votingRollup.waitForDeployment();
    });

    describe("Gas Benchmarks", function () {
        this.timeout(600000);

        const PARALLEL_WORKERS = 4;
        const SUB_BATCH_SIZE = 100;
        const GAS_PER_SUB_BATCH = 2366700;
        const MAX_GAS_PER_BATCH = 12_000_000;
        const ONE_VOTE_GAS = 90940;
        const results = [];

        function saveResultsToCSV() {
            if (!fs.existsSync(BENCHMARK_OUTPUT_DIR)) {
                fs.mkdirSync(BENCHMARK_OUTPUT_DIR, { recursive: true });
            }

            const header = [
                "batch_size",
                "num_sub_batches",
                "sub_batch_size",
                "total_gas",
                "gas_per_vote",
                "vs_1vote_efficiency",
                "efficiency_pct",
                "execution_time_ms",
                "execution_time_sec",
                "method",
                "workers"
            ].join(",") + "\n";

            const rows = results.map(r => [
                r.batchSize,
                r.numSubBatches,
                r.subBatchSize,
                r.totalGas,
                r.gasPerVote.toFixed(2),
                r.efficiency.toFixed(2),
                r.efficiencyPct.toFixed(2),
                r.execTimeMs.toFixed(0),
                (r.execTimeMs / 1000).toFixed(2),
                r.method,
                r.workers || ""
            ].join(",")).join("\n");

            fs.writeFileSync(CSV_OUTPUT_PATH, header + rows);
        }

        async function submitSequential(batchSize, signer, salt) {
            const start = Date.now();
            let totalGas = 0;
            let numSubBatches = 1;

            if (batchSize > 700) {
                numSubBatches = Math.ceil(batchSize / SUB_BATCH_SIZE);
                for (let i = 0; i < batchSize; i += SUB_BATCH_SIZE) {
                    const sSize = Math.min(SUB_BATCH_SIZE, batchSize - i);
                    const subBatchIndex = Math.floor(i / SUB_BATCH_SIZE);

                    const subStateRoot = F.toObject(poseidon([BigInt(subBatchIndex + 1), BigInt(sSize)]));
                    const subBatchHash = F.toObject(poseidon([BigInt(subBatchIndex), BigInt(sSize)]));

                    const nullifiers = [];
                    for (let j = 0; j < sSize; j++) {
                        nullifiers.push(F.toObject(poseidon([BigInt(i + j + salt + batchSize * 1000)])));
                    }

                    const tx = await votingRollup.connect(signer).submitBatch(
                        [0, 0], [[0, 0], [0, 0]], [0, 0],
                        subStateRoot, subBatchHash, nullifiers
                    );
                    const receipt = await tx.wait();
                    totalGas += Number(receipt.gasUsed);
                }
            } else {
                const nullifiers = [];
                for (let i = 0; i < batchSize; i++) {
                    nullifiers.push(F.toObject(poseidon([BigInt(i + salt + batchSize * 1000)])));
                }
                const tx = await votingRollup.connect(signer).submitBatch(
                    [0, 0], [[0, 0], [0, 0]], [0, 0],
                    F.toObject(poseidon([BigInt(batchSize)])),
                    F.toObject(poseidon([BigInt(batchSize)])),
                    nullifiers
                );
                const receipt = await tx.wait();
                totalGas = Number(receipt.gasUsed);
            }

            return {
                totalGas,
                execTimeMs: Date.now() - start,
                numSubBatches,
                subBatchSize: batchSize > 700 ? SUB_BATCH_SIZE : batchSize
            };
        }

        async function submitParallel(batchSize, signer, salt) {
            const start = Date.now();
            const optimalSubBatchSize = Math.max(
                100,
                Math.floor(MAX_GAS_PER_BATCH / (GAS_PER_SUB_BATCH / 100))
            );
            const numSubBatches = Math.ceil(batchSize / optimalSubBatchSize);
            const subBatchesPerWorker = Math.ceil(numSubBatches / PARALLEL_WORKERS);

            const workerPromises = [];
            for (let w = 0; w < PARALLEL_WORKERS; w++) {
                const startIdx = w * subBatchesPerWorker;
                const endIdx = Math.min(startIdx + subBatchesPerWorker, numSubBatches);
                if (startIdx >= numSubBatches) break;

                workerPromises.push((async () => {
                    let workerGas = 0;
                    for (let i = startIdx; i < endIdx; i++) {
                        const voteStart = i * optimalSubBatchSize;
                        const sSize = Math.min(optimalSubBatchSize, batchSize - voteStart);
                        const subBatchIndex = i;

                        const subStateRoot = F.toObject(poseidon([BigInt(subBatchIndex + 1), BigInt(sSize)]));
                        const subBatchHash = F.toObject(poseidon([BigInt(subBatchIndex), BigInt(sSize)]));

                        const nullifiers = [];
                        for (let j = 0; j < sSize; j++) {
                            nullifiers.push(F.toObject(poseidon([BigInt(voteStart + j + salt + batchSize * 1000)])));
                        }

                        const tx = await votingRollup.connect(signer).submitBatch(
                            [0, 0], [[0, 0], [0, 0]], [0, 0],
                            subStateRoot, subBatchHash, nullifiers
                        );
                        const receipt = await tx.wait();
                        workerGas += Number(receipt.gasUsed);
                    }
                    return workerGas;
                })());
            }

            const workerResults = await Promise.all(workerPromises);
            const totalGas = workerResults.reduce((a, b) => a + b, 0);
            return { totalGas, execTimeMs: Date.now() - start, numSubBatches, subBatchSize: optimalSubBatchSize };
        }

        it("should run full benchmark suite and export CSV", async function () {
            for (const batchSize of ALL_BATCH_SIZES) {
                const isLarge = batchSize > 10000;
                const method = isLarge ? "parallel" : "sequential";
                const salt = 2000;

                const { totalGas, execTimeMs, numSubBatches, subBatchSize } = isLarge
                    ? await submitParallel(batchSize, owner, salt)
                    : await submitSequential(batchSize, owner, salt);

                const gasPerVote = totalGas / batchSize;
                const efficiency = ONE_VOTE_GAS / gasPerVote;
                const efficiencyPct = ((ONE_VOTE_GAS - gasPerVote) / ONE_VOTE_GAS) * 100;

                results.push({
                    batchSize,
                    numSubBatches,
                    subBatchSize,
                    totalGas,
                    gasPerVote,
                    efficiency,
                    efficiencyPct,
                    execTimeMs,
                    method,
                    workers: isLarge ? PARALLEL_WORKERS : ""
                });
            }

            saveResultsToCSV();
            expect(fs.existsSync(CSV_OUTPUT_PATH)).to.equal(true);
        });
    });
});
