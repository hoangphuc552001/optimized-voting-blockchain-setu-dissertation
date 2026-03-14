const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

class Submitter {
    constructor(rpcUrl, privateKey, rollupAddress) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.rollupAddress = rollupAddress;
        this.contract = null;
    }

    async init() {
        const abi = [
            "function submitBatch(uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256 newStateRoot, uint256 batchNullifierHash, uint256[] calldata nullifierList) external",
            "function stateRoot() view returns (uint256)",
            "function batchCount() view returns (uint256)",
            "function votingActive() view returns (bool)",
            "function endVoting() external",
            "event BatchSubmitted(uint256 indexed batchIndex, uint256 preStateRoot, uint256 postStateRoot, uint256 voteCount)"
        ];

        this.contract = new ethers.Contract(this.rollupAddress, abi, this.wallet);
        console.log("[L1] Submitter connected to", this.rollupAddress);
        console.log("[L1] Operator address:", this.wallet.address);
    }

    async submitBatch(formattedProof, newStateRoot, batchNullifierHash, nullifierList) {
        console.log("[L1] Submitting batch to VotingRollup...");

        try {
            const tx = await this.contract.submitBatch(
                formattedProof.a,
                formattedProof.b,
                formattedProof.c,
                newStateRoot,
                batchNullifierHash,
                nullifierList
            );

            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.toString();

            console.log(`[L1] Batch accepted! tx: ${receipt.hash}`);
            console.log(`[L1] Gas used: ${gasUsed}`);

            return {
                txHash: receipt.hash,
                gasUsed,
                blockNumber: receipt.blockNumber
            };
        } catch (err) {
            console.error("[L1] Batch submission failed:", err.message);
            throw err;
        }
    }

    async getState() {
        const stateRoot = await this.contract.stateRoot();
        const batchCount = await this.contract.batchCount();
        const votingActive = await this.contract.votingActive();

        return {
            stateRoot: stateRoot.toString(),
            batchCount: Number(batchCount),
            votingActive
        };
    }

    async endVoting() {
        const tx = await this.contract.endVoting();
        await tx.wait();
        console.log("[L1] Voting ended");
    }
}

module.exports = { Submitter };
