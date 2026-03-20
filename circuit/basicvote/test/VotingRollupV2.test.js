const { expect } = require("chai");
const { ethers } = require("hardhat");
const { buildPoseidon } = require("circomlibjs");

describe("VotingRollupV2 — Two-Layer Architecture", function () {
    let votingRollupV2;
    let mockVoteVerifier;
    let mockBatchVerifier;
    let owner;
    let addr1;
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
        [owner, addr1] = await ethers.getSigners();

        initialStateRoot = await computeEmptyStateRoot(poseidon, F, 5);
        voterMerkleRoot = F.toObject(poseidon([1n, 2n, 3n]));
        electionId = 1;

        const MockVoteVerifier = await ethers.getContractFactory("MockVoteVerifier");
        mockVoteVerifier = await MockVoteVerifier.deploy();
        await mockVoteVerifier.waitForDeployment();

        const MockBatchVerifier = await ethers.getContractFactory("MockBatchVerifier");
        mockBatchVerifier = await MockBatchVerifier.deploy();
        await mockBatchVerifier.waitForDeployment();

        const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
        votingRollupV2 = await VotingRollupV2.deploy(
            await mockVoteVerifier.getAddress(),
            await mockBatchVerifier.getAddress(),
            initialStateRoot,
            voterMerkleRoot,
            electionId,
            2 // spot-check 2 individual proofs per batch
        );
        await votingRollupV2.waitForDeployment();
    });

    describe("Deployment", function () {
        it("should set initial state correctly", async function () {
            expect(await votingRollupV2.stateRoot()).to.equal(initialStateRoot);
            expect(await votingRollupV2.voterMerkleRoot()).to.equal(voterMerkleRoot);
            expect(await votingRollupV2.electionId()).to.equal(electionId);
            expect(await votingRollupV2.votingActive()).to.be.true;
            expect(await votingRollupV2.batchCount()).to.equal(0);
            expect(await votingRollupV2.spotCheckCount()).to.equal(2);
        });

        it("should set deployer as admin", async function () {
            expect(await votingRollupV2.admin()).to.equal(owner.address);
        });

        it("should emit VotingStarted event", async function () {
            const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
            const newRollup = await VotingRollupV2.deploy(
                await mockVoteVerifier.getAddress(),
                await mockBatchVerifier.getAddress(),
                initialStateRoot,
                voterMerkleRoot,
                42,
                0
            );
            await newRollup.waitForDeployment();
            const deployTx = newRollup.deploymentTransaction();
            const receipt = await deployTx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return newRollup.interface.parseLog(log)?.name === "VotingStarted";
                } catch { return false; }
            });
            expect(event).to.not.be.undefined;
            const parsed = newRollup.interface.parseLog(event);
            expect(parsed.args[0]).to.equal(42);
        });

        it("should reject zero address verifiers", async function () {
            const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
            await expect(
                VotingRollupV2.deploy(ethers.ZeroAddress, await mockBatchVerifier.getAddress(), initialStateRoot, voterMerkleRoot, electionId, 0)
            ).to.be.revertedWith("VoteVerifier address cannot be zero");

            await expect(
                VotingRollupV2.deploy(await mockVoteVerifier.getAddress(), ethers.ZeroAddress, initialStateRoot, voterMerkleRoot, electionId, 0)
            ).to.be.revertedWith("BatchVerifier address cannot be zero");
        });
    });

    describe("submitBatch", function () {
        const dummyProof = {
            a: [0, 0],
            b: [[0, 0], [0, 0]],
            c: [0, 0]
        };

        // Dummy individual vote proof public signals: [nullifier, candidate, vote, merkleRoot, electionId]
        function makeDummyVoteSignals(nullifier, candidate, vote, merkleRoot, elId) {
            return [nullifier, candidate, vote, merkleRoot, elId];
        }

        it("should accept a valid batch with spot-checked vote proofs", async function () {
            const newStateRoot = F.toObject(poseidon([100n, 200n]));
            const batchNullifierHash = F.toObject(poseidon([1n, 2n]));
            const nullifierList = [
                F.toObject(poseidon([10n])),
                F.toObject(poseidon([20n]))
            ];

            // 2 individual vote proofs for spot-checking
            const voteProofsA = [dummyProof.a, dummyProof.a];
            const voteProofsB = [dummyProof.b, dummyProof.b];
            const voteProofsC = [dummyProof.c, dummyProof.c];
            const votePublicSignals = [
                makeDummyVoteSignals(nullifierList[0], 0, 1, voterMerkleRoot, electionId),
                makeDummyVoteSignals(nullifierList[1], 1, 1, voterMerkleRoot, electionId)
            ];

            await expect(
                votingRollupV2.submitBatch(
                    dummyProof.a, dummyProof.b, dummyProof.c,
                    newStateRoot, batchNullifierHash,
                    nullifierList,
                    voteProofsA, voteProofsB, voteProofsC,
                    votePublicSignals
                )
            ).to.emit(votingRollupV2, "BatchSubmitted")
                .withArgs(0, initialStateRoot, newStateRoot, 2);

            expect(await votingRollupV2.stateRoot()).to.equal(newStateRoot);
            expect(await votingRollupV2.batchCount()).to.equal(1);
        });

        it("should work with zero spot-checks", async function () {
            // Deploy with spotCheckCount = 0
            const VotingRollupV2 = await ethers.getContractFactory("VotingRollupV2");
            const noSpotCheck = await VotingRollupV2.deploy(
                await mockVoteVerifier.getAddress(),
                await mockBatchVerifier.getAddress(),
                initialStateRoot,
                voterMerkleRoot,
                electionId,
                0
            );
            await noSpotCheck.waitForDeployment();

            const newStateRoot = F.toObject(poseidon([100n]));
            const batchNullifierHash = F.toObject(poseidon([1n]));

            await noSpotCheck.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                newStateRoot, batchNullifierHash,
                [F.toObject(poseidon([10n]))],
                [], [], [], []
            );

            expect(await noSpotCheck.stateRoot()).to.equal(newStateRoot);
        });

        it("should register nullifiers on L1", async function () {
            const newStateRoot = F.toObject(poseidon([100n]));
            const batchNullifierHash = F.toObject(poseidon([1n]));
            const nullifier1 = F.toObject(poseidon([10n]));
            const nullifier2 = F.toObject(poseidon([20n]));

            await votingRollupV2.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                newStateRoot, batchNullifierHash,
                [nullifier1, nullifier2],
                [dummyProof.a, dummyProof.a],
                [dummyProof.b, dummyProof.b],
                [dummyProof.c, dummyProof.c],
                [
                    makeDummyVoteSignals(nullifier1, 0, 1, voterMerkleRoot, electionId),
                    makeDummyVoteSignals(nullifier2, 1, 1, voterMerkleRoot, electionId)
                ]
            );

            expect(await votingRollupV2.isNullifierUsed(nullifier1)).to.be.true;
            expect(await votingRollupV2.isNullifierUsed(nullifier2)).to.be.true;
            expect(await votingRollupV2.isNullifierUsed(999)).to.be.false;
        });

        it("should reject duplicate nullifiers across batches", async function () {
            const nullifier = F.toObject(poseidon([10n]));
            const stateRoot1 = F.toObject(poseidon([100n]));
            const stateRoot2 = F.toObject(poseidon([200n]));

            await votingRollupV2.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot1, F.toObject(poseidon([1n])),
                [nullifier],
                [dummyProof.a, dummyProof.a],
                [dummyProof.b, dummyProof.b],
                [dummyProof.c, dummyProof.c],
                [
                    makeDummyVoteSignals(nullifier, 0, 1, voterMerkleRoot, electionId),
                    makeDummyVoteSignals(F.toObject(poseidon([99n])), 1, 1, voterMerkleRoot, electionId)
                ]
            );

            await expect(
                votingRollupV2.submitBatch(
                    dummyProof.a, dummyProof.b, dummyProof.c,
                    stateRoot2, F.toObject(poseidon([2n])),
                    [nullifier],
                    [dummyProof.a, dummyProof.a],
                    [dummyProof.b, dummyProof.b],
                    [dummyProof.c, dummyProof.c],
                    [
                        makeDummyVoteSignals(nullifier, 0, 1, voterMerkleRoot, electionId),
                        makeDummyVoteSignals(F.toObject(poseidon([88n])), 1, 1, voterMerkleRoot, electionId)
                    ]
                )
            ).to.be.revertedWith("Duplicate nullifier");
        });

        it("should chain state roots correctly across batches", async function () {
            const stateRoot1 = F.toObject(poseidon([100n]));
            const stateRoot2 = F.toObject(poseidon([200n]));

            await votingRollupV2.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot1, F.toObject(poseidon([1n])),
                [F.toObject(poseidon([10n]))],
                [dummyProof.a, dummyProof.a],
                [dummyProof.b, dummyProof.b],
                [dummyProof.c, dummyProof.c],
                [
                    makeDummyVoteSignals(F.toObject(poseidon([10n])), 0, 1, voterMerkleRoot, electionId),
                    makeDummyVoteSignals(F.toObject(poseidon([11n])), 1, 1, voterMerkleRoot, electionId)
                ]
            );
            expect(await votingRollupV2.stateRoot()).to.equal(stateRoot1);
            expect(await votingRollupV2.batchCount()).to.equal(1);

            await votingRollupV2.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot2, F.toObject(poseidon([2n])),
                [F.toObject(poseidon([20n]))],
                [dummyProof.a, dummyProof.a],
                [dummyProof.b, dummyProof.b],
                [dummyProof.c, dummyProof.c],
                [
                    makeDummyVoteSignals(F.toObject(poseidon([20n])), 2, 1, voterMerkleRoot, electionId),
                    makeDummyVoteSignals(F.toObject(poseidon([21n])), 3, 1, voterMerkleRoot, electionId)
                ]
            );
            expect(await votingRollupV2.stateRoot()).to.equal(stateRoot2);
            expect(await votingRollupV2.batchCount()).to.equal(2);
        });

        it("should reject batches after voting ends", async function () {
            await votingRollupV2.endVoting();

            await expect(
                votingRollupV2.submitBatch(
                    dummyProof.a, dummyProof.b, dummyProof.c,
                    F.toObject(poseidon([100n])),
                    F.toObject(poseidon([1n])),
                    [F.toObject(poseidon([10n]))],
                    [], [], [], []
                )
            ).to.be.revertedWith("Voting not active");
        });
    });

    describe("Voting Lifecycle", function () {
        it("should allow admin to end voting", async function () {
            await expect(votingRollupV2.endVoting())
                .to.emit(votingRollupV2, "VotingEnded");
            expect(await votingRollupV2.votingActive()).to.be.false;
        });

        it("should reject non-admin ending voting", async function () {
            await expect(
                votingRollupV2.connect(addr1).endVoting()
            ).to.be.revertedWith("Only admin");
        });

        it("should reject ending voting twice", async function () {
            await votingRollupV2.endVoting();
            await expect(votingRollupV2.endVoting()).to.be.revertedWith("Voting already ended");
        });
    });

    describe("Gas Benchmarks — Two-Layer vs Single-Layer", function () {
        const batchSizes = [4, 10, 25, 50, 100, 500, 600, 700];
        const dummyProof = {
            a: [0, 0],
            b: [[0, 0], [0, 0]],
            c: [0, 0]
        };

        it("should generate comparison table with spot-checks", async function () {
            console.log("\n" + "=".repeat(90));
            console.log("   TWO-LAYER GAS BENCHMARK (with 2 spot-checks per batch)");
            console.log("=".repeat(90));
            console.log("| Batch Size | Total Gas   | Gas/Vote | L1 Cost     | Savings |");
            console.log("|".repeat(65));

            const L1_VOTE_GAS = 300000;

            for (const batchSize of batchSizes) {
                const newStateRoot = F.toObject(poseidon([BigInt(batchSize + 1000)]));
                const batchNullifierHash = F.toObject(poseidon([BigInt(batchSize + 1000)]));

                const nullifiers = [];
                for (let i = 0; i < batchSize; i++) {
                    nullifiers.push(F.toObject(poseidon([BigInt(i + 500 + batchSize * 2000)])));
                }

                // 2 spot-check proofs
                const spotSignals = [
                    [nullifiers[0], 0, 1, voterMerkleRoot, electionId],
                    [nullifiers[1 < nullifiers.length ? 1 : 0], 1, 1, voterMerkleRoot, electionId]
                ];

                const tx = await votingRollupV2.submitBatch(
                    dummyProof.a, dummyProof.b, dummyProof.c,
                    newStateRoot, batchNullifierHash,
                    nullifiers,
                    [dummyProof.a, dummyProof.a],
                    [dummyProof.b, dummyProof.b],
                    [dummyProof.c, dummyProof.c],
                    spotSignals
                );

                const receipt = await tx.wait();
                const gasUsed = Number(receipt.gasUsed);
                const gasPerVote = (gasUsed / batchSize).toFixed(0);
                const l1Cost = batchSize * L1_VOTE_GAS;
                const savings = (100 - (gasPerVote / L1_VOTE_GAS * 100)).toFixed(1);

                console.log(`| ${batchSize.toString().padEnd(10)} | ${gasUsed.toString().padEnd(11)} | ${gasPerVote.padEnd(8)} | ${l1Cost.toString().padEnd(11)} | ${savings}% |`);
            }

            console.log("=".repeat(90));
        });
    });
});
