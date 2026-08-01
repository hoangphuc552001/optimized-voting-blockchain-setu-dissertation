'use strict';
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prove } = require('../bulletproofs/rangeProof');
const { proofToCalldata } = require('../bulletproofs/proofToCalldata');

describe('BPVerifier + BPVotingBox', function () {
  this.timeout(300_000); // proving can take a few seconds

  let verifier, voting;

  before(async function () {
    const BPVerifier  = await ethers.getContractFactory('BPVerifier');
    verifier          = await BPVerifier.deploy();
    await verifier.waitForDeployment();

    const BPVotingBox = await ethers.getContractFactory('BPVotingBox');
    voting            = await BPVotingBox.deploy(await verifier.getAddress());
    await voting.waitForDeployment();
  });

  it('verifies a valid range proof for each candidate', async function () {
    for (const v of [0n, 1n, 2n, 3n, 4n]) {
      const proof = prove(v, null, 4);
      const cd    = proofToCalldata(proof);
      const ok    = await verifier.verify(cd);
      expect(ok, `v=${v} should verify`).to.be.true;
    }
  });

  it('rejects an out-of-range proof', async function () {
    // Manually tamper tHat to break Check 1
    const proof = prove(3n, null, 4);
    const cd    = proofToCalldata(proof);
    cd[10] = cd[10] + 1n; // corrupt tHat
    const ok = await verifier.verify(cd);
    expect(ok).to.be.false;
  });

  it('records a vote and prevents double-voting', async function () {
    const [voter] = await ethers.getSigners();
    const v       = 2n;
    const proof   = prove(v, null, 4);
    const cd      = proofToCalldata(proof);
    const nullifier = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256'], [voter.address, 1n])
    );

    await voting.castVote(cd, v, nullifier);

    await expect(
      voting.castVote(cd, v, nullifier)
    ).to.be.revertedWith('Already voted');

    const results = await voting.getResults();
    expect(results[2]).to.equal(1n);
  });

  it('rejects invalid candidate index', async function () {
    const proof = prove(0n, null, 4);
    const cd    = proofToCalldata(proof);
    const nullifier = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [9999n])
    );
    await expect(
      voting.castVote(cd, 5n, nullifier)
    ).to.be.revertedWith('Invalid candidate');
  });
});
