'use strict';
const { ethers } = require('hardhat');
const { expect } = require('chai');
const STARK = require('../stark/stark');
const F = require('../stark/field');
const { proofToCalldata } = require('../stark/proofToCalldata');

describe('StarkVerifier + StarkVotingBox', function () {
  this.timeout(600_000);

  let verifier, voting;

  before(async function () {
    const SV = await ethers.getContractFactory('StarkVerifier');
    verifier = await SV.deploy();
    await verifier.waitForDeployment();

    const VB = await ethers.getContractFactory('StarkVotingBox');
    voting = await VB.deploy(await verifier.getAddress());
    await voting.waitForDeployment();
  });

  it('verifies a valid STARK proof on-chain', async function () {
    const proof = STARK.prove(12345n);
    expect(STARK.verify(proof), 'JS verify').to.be.true; // sanity
    const cd = proofToCalldata(proof);
    const ok = await verifier.verify(cd);
    expect(ok, 'on-chain verify').to.be.true;
  });

  it('rejects a proof with a tampered output', async function () {
    const proof = STARK.prove(777n);
    const cd = proofToCalldata(proof);
    cd.output = F.add(proof.output, 1n); // break the boundary constraint
    const ok = await verifier.verify(cd);
    expect(ok).to.be.false;
  });

  it('rejects a proof with a tampered trace opening', async function () {
    const proof = STARK.prove(555n);
    const cd = proofToCalldata(proof);
    cd.queries[0].f0 = F.add(cd.queries[0].f0, 1n);
    const ok = await verifier.verify(cd);
    expect(ok).to.be.false;
  });

  it('casts a vote and prevents double-voting', async function () {
    const [voter] = await ethers.getSigners();
    const proof = STARK.prove(24680n);
    const cd = proofToCalldata(proof);
    const candidate = 3n;
    const nullifier = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [voter.address, 1n])
    );

    await voting.castVote(cd, candidate, nullifier);
    await expect(voting.castVote(cd, candidate, nullifier)).to.be.revertedWith('Already voted');

    const results = await voting.getResults();
    expect(results[3]).to.equal(1n);
  });
});
