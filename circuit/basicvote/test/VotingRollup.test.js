const { expect } = require("chai");
const { ethers } = require("hardhat");
const { buildPoseidon } = require("circomlibjs");

describe("VotingRollup", function () {
    let votingRollup;
    let mockVerifier;
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

    describe("Deployment", function () {
        it("should set initial state correctly", async function () {
            expect(await votingRollup.stateRoot()).to.equal(initialStateRoot);
            expect(await votingRollup.voterMerkleRoot()).to.equal(voterMerkleRoot);
            expect(await votingRollup.electionId()).to.equal(electionId);
            expect(await votingRollup.votingActive()).to.be.true;
            expect(await votingRollup.batchCount()).to.equal(0);
        });

        it("should set deployer as admin", async function () {
            expect(await votingRollup.admin()).to.equal(owner.address);
        });

        it("should emit VotingStarted event", async function () {
            const VotingRollup = await ethers.getContractFactory("VotingRollup");
            const newRollup = await VotingRollup.deploy(
                await mockVerifier.getAddress(),
                initialStateRoot,
                voterMerkleRoot,
                42
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

        it("should reject zero address verifier", async function () {
            const VotingRollup = await ethers.getContractFactory("VotingRollup");
            await expect(
                VotingRollup.deploy(ethers.ZeroAddress, initialStateRoot, voterMerkleRoot, electionId)
            ).to.be.revertedWith("Verifier address cannot be zero");
        });
    });

    describe("submitBatch", function () {
        const dummyProof = {
            a: [0, 0],
            b: [[0, 0], [0, 0]],
            c: [0, 0]
        };

        it("should accept a valid batch and update state root", async function () {
            const newStateRoot = F.toObject(poseidon([100n, 200n]));
            const batchNullifierHash = F.toObject(poseidon([1n, 2n]));
            const nullifierList = [
                F.toObject(poseidon([10n])),
                F.toObject(poseidon([20n]))
            ];

            await expect(
                votingRollup.submitBatch(
                    dummyProof.a,
                    dummyProof.b,
                    dummyProof.c,
                    newStateRoot,
                    batchNullifierHash,
                    nullifierList
                )
            ).to.emit(votingRollup, "BatchSubmitted")
                .withArgs(0, initialStateRoot, newStateRoot, 2);

            expect(await votingRollup.stateRoot()).to.equal(newStateRoot);
            expect(await votingRollup.batchCount()).to.equal(1);
        });

        it("should register nullifiers on L1", async function () {
            const newStateRoot = F.toObject(poseidon([100n]));
            const batchNullifierHash = F.toObject(poseidon([1n]));
            const nullifier1 = F.toObject(poseidon([10n]));
            const nullifier2 = F.toObject(poseidon([20n]));

            await votingRollup.submitBatch(
                dummyProof.a,
                dummyProof.b,
                dummyProof.c,
                newStateRoot,
                batchNullifierHash,
                [nullifier1, nullifier2]
            );

            expect(await votingRollup.isNullifierUsed(nullifier1)).to.be.true;
            expect(await votingRollup.isNullifierUsed(nullifier2)).to.be.true;
            expect(await votingRollup.isNullifierUsed(999)).to.be.false;
        });

        it("should reject duplicate nullifiers across batches", async function () {
            const nullifier = F.toObject(poseidon([10n]));
            const stateRoot1 = F.toObject(poseidon([100n]));
            const stateRoot2 = F.toObject(poseidon([200n]));
            const batchHash1 = F.toObject(poseidon([1n]));
            const batchHash2 = F.toObject(poseidon([2n]));

            await votingRollup.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot1, batchHash1, [nullifier]
            );

            await expect(
                votingRollup.submitBatch(
                    dummyProof.a, dummyProof.b, dummyProof.c,
                    stateRoot2, batchHash2, [nullifier]
                )
            ).to.be.revertedWith("Duplicate nullifier");
        });

        it("should chain state roots correctly across batches", async function () {
            const stateRoot1 = F.toObject(poseidon([100n]));
            const stateRoot2 = F.toObject(poseidon([200n]));
            const stateRoot3 = F.toObject(poseidon([300n]));

            await votingRollup.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot1, F.toObject(poseidon([1n])),
                [F.toObject(poseidon([10n]))]
            );
            expect(await votingRollup.stateRoot()).to.equal(stateRoot1);
            expect(await votingRollup.batchCount()).to.equal(1);

            await votingRollup.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot2, F.toObject(poseidon([2n])),
                [F.toObject(poseidon([20n]))]
            );
            expect(await votingRollup.stateRoot()).to.equal(stateRoot2);
            expect(await votingRollup.batchCount()).to.equal(2);

            await votingRollup.submitBatch(
                dummyProof.a, dummyProof.b, dummyProof.c,
                stateRoot3, F.toObject(poseidon([3n])),
                [F.toObject(poseidon([30n]))]
            );
            expect(await votingRollup.stateRoot()).to.equal(stateRoot3);
            expect(await votingRollup.batchCount()).to.equal(3);
        });

        it("should reject batches after voting ends", async function () {
            await votingRollup.endVoting();

            await expect(
                votingRollup.submitBatch(
                    dummyProof.a, dummyProof.b, dummyProof.c,
                    F.toObject(poseidon([100n])),
                    F.toObject(poseidon([1n])),
                    [F.toObject(poseidon([10n]))]
                )
            ).to.be.revertedWith("Voting not active");
        });
    });

    describe("Voting Lifecycle", function () {
        it("should allow admin to end voting", async function () {
            await expect(votingRollup.endVoting())
                .to.emit(votingRollup, "VotingEnded");
            expect(await votingRollup.votingActive()).to.be.false;
        });

        it("should reject non-admin ending voting", async function () {
            await expect(
                votingRollup.connect(addr1).endVoting()
            ).to.be.revertedWith("Only admin");
        });

        it("should reject ending voting twice", async function () {
            await votingRollup.endVoting();
            await expect(votingRollup.endVoting()).to.be.revertedWith("Voting already ended");
        });
    });

    describe("View Functions", function () {
        it("should return correct state via getState()", async function () {
            const state = await votingRollup.getState();
            expect(state._stateRoot).to.equal(initialStateRoot);
            expect(state._voterMerkleRoot).to.equal(voterMerkleRoot);
            expect(state._electionId).to.equal(electionId);
            expect(state._batchCount).to.equal(0);
            expect(state._votingActive).to.be.true;
        });
    });

    describe("Gas Benchmarks", function () {
        it("should measure gas for batch submission", async function () {
            const newStateRoot = F.toObject(poseidon([100n]));
            const batchNullifierHash = F.toObject(poseidon([1n, 2n, 3n, 4n]));
            const nullifiers = [];
            for (let i = 0; i < 4; i++) {
                nullifiers.push(F.toObject(poseidon([BigInt(i + 100)])));
            }

            const tx = await votingRollup.submitBatch(
                [0, 0], [[0, 0], [0, 0]], [0, 0],
                newStateRoot,
                batchNullifierHash,
                nullifiers
            );

            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed;

            console.log("\n=== Gas Benchmark ===");
            console.log(`Batch of 4 votes (rollup): ${gasUsed.toString()} gas`);
            console.log(`Per-vote gas (rollup): ${(Number(gasUsed) / 4).toFixed(0)} gas`);
            console.log(`Per-vote gas (direct L1, ~300k): 300,000 gas`);
            console.log(`Gas savings: ~${(100 - (Number(gasUsed) / 4 / 300000 * 100)).toFixed(1)}%`);
        });
    });
});
