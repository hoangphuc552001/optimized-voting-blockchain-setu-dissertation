# ============================================
# ZK Rollup Voting Flow - Complete Script
# Setup → Generate Proof → Submit → Tally
# ============================================

# Step 1: Register voters
node scripts/registerVoters.js

# Step 2: Build voter Merkle Tree
node scripts/buildMerkleTree.js

# Step 3: Compile batch rollup circuit
circom circuits/BatchVote.circom --r1cs --wasm --sym -o build -l node_modules

# Step 4: Powers of Tau setup
snarkjs powersoftau new bn128 18 build/pot18_0000.ptau -v
snarkjs powersoftau contribute build/pot18_0000.ptau build/pot18_0001.ptau --name="First contribution" -v -e="random entropy"
snarkjs powersoftau prepare phase2 build/pot18_0001.ptau build/pot18_final.ptau -v

# Step 5: Groth16 setup
snarkjs groth16 setup build/BatchVote.r1cs build/pot18_final.ptau build/batch_0000.zkey
snarkjs zkey contribute build/batch_0000.zkey build/batch_0001.zkey --name="Batch Contributor 1" -v -e="batch more random entropy"
snarkjs zkey export verificationkey build/batch_0001.zkey build/batch_verification_key.json

# Step 6: Generate Solidity verifier for batch circuit
snarkjs zkey export solidityverifier build/batch_0001.zkey contracts/BatchVerifier.sol

# ============================================
# PHASE 1: Setup Complete
# ============================================

# Step 7: Start local blockchain (run in separate terminal or background)
npx hardhat node --hostname 127.0.0.1 --port 8547

# Step 8: Deploy rollup contracts (BatchVerifier + VotingRollup)
npx hardhat run scripts/deployRollup.js --network localhost

# ============================================
# PHASE 2: Generate Proof
# ============================================

# Step 9: Generate batch input from voter data
node scripts/generateBatchInput.js

# Step 10: Generate batch witness
node build/BatchVote_js/generate_witness.js build/BatchVote_js/BatchVote.wasm batch_input.json build/batch_witness.wtns

# Step 11: Generate batch proof (single proof for all votes)
snarkjs groth16 prove build/batch_0001.zkey build/batch_witness.wtns build/batch_proof.json build/batch_public.json

# Step 12: Verify batch proof locally
snarkjs groth16 verify build/batch_verification_key.json build/batch_public.json build/batch_proof.json

# ============================================
# PHASE 3: Submit to Chain
# ============================================

# Step 13: Submit batch proof to the VotingRollup contract
npx hardhat run scripts/submitBatchProof.js --network localhost

# ============================================
# PHASE 4: Tally Results
# ============================================

# Step 14: Get tally results and end voting
npx hardhat run scripts/getTally.js --network localhost

# ============================================
# ALTERNATIVE: Use the operator HTTP server
# instead of Steps 9-14
# ============================================
# Start operator: node operator/index.js
# Submit votes:   curl -X POST http://localhost:3000/api/vote -H "Content-Type: application/json" -d @vote.json
# Force batch:    curl -X POST http://localhost:3000/api/force-batch
# Check tally:    curl http://localhost:3000/api/tally
# Check status:   curl http://localhost:3000/api/status

# ============================================
# RUN TESTS
# ============================================

# Step 15: Run VotingRollup contract tests (includes gas benchmarks)
npx hardhat test test/VotingRollup.test.js
