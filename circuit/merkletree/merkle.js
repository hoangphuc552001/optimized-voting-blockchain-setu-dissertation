/**
 * Merkle Tree - Incremental Insertion
 * Transactions added one by one (real-world blockchain approach)
 */

const CryptoJS = require('crypto-js');

class MerkleTree {
    constructor(algorithm = 'SHA256') {
        this.algorithm = algorithm;
        this.leaves = [];
        this.levels = [];
    }

    hash(data) {
        switch(this.algorithm) {
            case 'SHA256': return CryptoJS.SHA256(data).toString();
            case 'SHA512': return CryptoJS.SHA512(data).toString();
            case 'SHA3': return CryptoJS.SHA3(data, { outputLength: 256 }).toString();
            default: return CryptoJS.SHA256(data).toString();
        }
    }

    addLeaf(data) {
        const leafHash = this.hash(data);
        this.leaves.push(leafHash);
        this.updateTree();
        console.log(`\n📥 Added: "${data}"`);
        this.printTree();
        return this;
    }
    printTree() {
        if (!this.levels.length) return;
        console.log('\n  Tree:');
        for (let i = this.levels.length - 1; i >= 0; i--) {
            const label = i === this.levels.length - 1 ? 'ROOT' : `L${i}`;
            console.log(`  ${label}: [${this.levels[i].map(h => h.substring(0, 8) + '..').join(', ')}]`);
        }
    }


    updateTree() {
        let currentLevel = [...this.leaves];
        this.levels = [currentLevel];

        while (currentLevel.length > 1) {
            if (currentLevel.length % 2 !== 0) {
                currentLevel.push(currentLevel[currentLevel.length - 1]);
            }
            let nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                nextLevel.push(this.hash(currentLevel[i] + currentLevel[i + 1]));
            }
            this.levels.push(nextLevel);
            currentLevel = nextLevel;
        }
    }

    getRoot() {
        return this.levels.length ? this.levels[this.levels.length - 1][0] : null;
    }

    getProof(dataItem) {
        const dataHash = this.hash(dataItem);
        const index = this.leaves.indexOf(dataHash);
        if (index === -1) return null;

        const proof = [];
        let currentHash = dataHash;
        let currentIndex = index;

        for (let level = 0; level < this.levels.length - 1; level++) {
            const levelHashes = this.levels[level];
            const isLeft = currentIndex % 2 === 0;
            const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
            if (siblingIndex >= levelHashes.length) break;
            const siblingHash = levelHashes[siblingIndex];

            proof.push({ hash: siblingHash, side: isLeft ? 'right' : 'left' });
            currentHash = this.hash(isLeft ? currentHash + siblingHash : siblingHash + currentHash);
            currentIndex = Math.floor(currentIndex / 2);
        }
        return proof;
    }

    verifyProof(dataItem, proof, root) {
        let currentHash = this.hash(dataItem);
        for (const p of proof) {
            currentHash = this.hash(p.side === 'left' ? p.hash + currentHash : currentHash + p.hash);
        }
        return currentHash === root;
    }

    build(dataItems) {
        this.leaves = [];
        this.levels = [];
        dataItems.forEach(item => this.addLeaf(item));
    }
}

const tree = new MerkleTree('SHA256');
['Tx1: Alice→Bob 10ETH', 'Tx2: Bob→Charlie 5ETH', 'Tx3: Charlie→Dave 3ETH', 'Tx4: Dave→Eve 8ETH', 'Tx5: Eve→Frank 2ETH'].forEach(tx => tree.addLeaf(tx));

const root = tree.getRoot();
console.log('Merkle Root:', root);

const proof = tree.getProof('Tx1: Alice→Bob 10ETH');
console.log('Proof for Tx1:', proof.map(p => `${p.side}: ${p.hash.slice(0,16)}...`));
console.log('Verification:', tree.verifyProof('Tx1: Alice→Bob 10ETH', proof, root));

module.exports = MerkleTree;
