const { buildPoseidon } = require("circomlibjs");

class StateTree {
    constructor(levels, poseidon) {
        this.levels = levels;
        this.numLeaves = 2 ** levels;
        this.poseidon = poseidon;
        this.F = poseidon.F;
        this.leaves = new Array(this.numLeaves).fill(0n);
        this.tree = [];
        this._buildTree();
    }

    static async create(levels) {
        const poseidon = await buildPoseidon();
        return new StateTree(levels, poseidon);
    }

    _hashLeaf(value) {
        return this.F.toObject(this.poseidon([BigInt(value)]));
    }

    _hashPair(left, right) {
        return this.F.toObject(this.poseidon([BigInt(left), BigInt(right)]));
    }

    _buildTree() {
        this.tree = [];
        const level0 = this.leaves.map(v => this._hashLeaf(v));
        this.tree.push(level0);

        for (let level = 0; level < this.levels; level++) {
            const currentLevel = this.tree[level];
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : 0n;
                nextLevel.push(this._hashPair(left, right));
            }
            this.tree.push(nextLevel);
        }
    }

    getRoot() {
        return this.tree[this.levels][0];
    }

    getLeaf(index) {
        return this.leaves[index];
    }

    getProof(index) {
        const pathElements = [];
        const pathIndices = [];
        let currentIndex = index;

        for (let level = 0; level < this.levels; level++) {
            const currentLevel = this.tree[level];
            const isLeft = currentIndex % 2 === 0;
            const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

            const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : 0n;
            pathElements.push(sibling);
            pathIndices.push(isLeft ? 0 : 1);

            currentIndex = Math.floor(currentIndex / 2);
        }

        return { pathElements, pathIndices };
    }

    updateLeaf(index, newValue) {
        const oldValue = this.leaves[index];
        this.leaves[index] = BigInt(newValue);
        this._buildTree();
        return { oldValue, newValue: BigInt(newValue) };
    }

    getTallies(numCandidates) {
        const tallies = {};
        for (let i = 0; i < numCandidates; i++) {
            tallies[i] = Number(this.leaves[i]);
        }
        return tallies;
    }

    getTotalVotes(numCandidates) {
        let total = 0;
        for (let i = 0; i < numCandidates; i++) {
            total += Number(this.leaves[i]);
        }
        return total;
    }
}

module.exports = { StateTree };
