# ============================================================
# Full Flow: Two-Layer ZK Rollup Voting (V2) — Deploy to Sepolia
# ============================================================

# 1. Register 16 voters
node scripts/registerVoters.js
node scripts/buildMerkleTree.js

# 2. Compile Layer 1 circuit (VoteProof — voter eligibility proof)
mkdir -Force build/vote_proof
circom circuits/VoteProof.circom --r1cs --wasm --sym -o build/vote_proof
# Note: pot18 works for smaller circuits too. Use pot16 if you have it.
snarkjs groth16 setup build/vote_proof/VoteProof.r1cs build/pot18_final.ptau build/vote_proof_0000.zkey
snarkjs zkey contribute build/vote_proof_0000.zkey build/vote_proof_0001.zkey --name="Vote proof" -v -e="random"
snarkjs zkey export verificationkey build/vote_proof_0001.zkey build/vote_proof_verification_key.json
snarkjs zkey export solidityverifier build/vote_proof_0001.zkey contracts/VoteVerifier.sol

# 3. Compile Layer 2 circuit (BatchStateUpdate — state transitions only)
mkdir -Force build/batch_state
circom circuits/BatchStateUpdate.circom --r1cs --wasm --sym -o build/batch_state
snarkjs groth16 setup build/batch_state/BatchStateUpdate.r1cs build/pot18_final.ptau build/batch_state_0000.zkey
snarkjs zkey contribute build/batch_state_0000.zkey build/batch_state_0001.zkey --name="Batch state" -v -e="random"
snarkjs zkey export verificationkey build/batch_state_0001.zkey build/batch_state_verification_key.json
snarkjs zkey export solidityverifier build/batch_state_0001.zkey contracts/BatchStateVerifier.sol

# 4. Generate individual vote proofs (Layer 1 — simulates voter devices)
node scripts/generateVoteProof.js

# 5. Generate batch state input from verified vote proofs (Layer 2 — operator side)
node scripts/generateBatchStateInput.js

# 6. Generate batch state proof (Layer 2)
snarkjs groth16 fullprove build/batch_state_input.json build/batch_state/BatchStateUpdate_js/BatchStateUpdate.wasm build/batch_state_0001.zkey build/batch_state_proof.json build/batch_state_public.json

# 7. Verify proofs locally before deploying (saves gas if something is wrong)
snarkjs groth16 verify build/batch_state_verification_key.json build/batch_state_public.json build/batch_state_proof.json

# 8. Compile contracts and deploy to Sepolia
npx hardhat compile
npx hardhat run scripts/deployTwoLayer.js --network sepolia

# 9. Submit the two-layer batch proof
npx hardhat run scripts/submitTwoLayerBatch.js --network sepolia

# 10. Get tally and end voting
npx hardhat run scripts/getTallyV2.js --network sepolia
