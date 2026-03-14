# Step 1: Register voters
node scripts/registerVoters.js

# Step 2: Build Merkle Tree
node scripts/buildMerkleTree.js

# Step 3: Compile Circom circuit
circom BasicVote.circom --r1cs --wasm --sym -o build -l node_modules

# Step 4: Powers of Tau setup
snarkjs powersoftau new bn128 15 build/pot15_0000.ptau -v
snarkjs powersoftau contribute build/pot15_0000.ptau build/pot15_0001.ptau --name="First contribution" -v -e="random entropy"
snarkjs powersoftau prepare phase2 build/pot15_0001.ptau build/pot15_final.ptau -v

# Step 5: Groth16 setup
snarkjs groth16 setup build/BasicVote.r1cs build/pot15_final.ptau build/BasicVote_0000.zkey
snarkjs zkey contribute build/BasicVote_0000.zkey build/BasicVote_0001.zkey --name="Contributor 1" -v -e="more random entropy"
snarkjs zkey export verificationkey build/BasicVote_0001.zkey build/verification_key.json

# Step 6: Generate Solidity verifier
snarkjs zkey export solidityverifier build/BasicVote_0001.zkey contracts/Verifier.sol

# Step 7: Deploy contracts to Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Step 8: Verify contracts on Etherscan
# (This step will be run after deployment - see below)

# ============================================
# SEPOLIA DEPLOYMENT COMPLETE
# ============================================
# The following steps require manual interaction:
#
# 1. Copy the deployed contract addresses from the output above
# 2. Update the scripts with the new addresses:
#    - scripts/startVoting.js
#    - scripts/submitBallot.js
#    - scripts/endVoting.js
#    - scripts/revealVote.js
#    - scripts/finalizeResults.js
#
# 3. Generate ZK proof (run locally):
#    node scripts/generateProof.js
#
# 4. Run voting phases on Sepolia:
#    npx hardhat run scripts/startVoting.js --network sepolia
#    npx hardhat run scripts/submitBallot.js --network sepolia
#    npx hardhat run scripts/endVoting.js --network sepolia
#    npx hardhat run scripts/revealVote.js --network sepolia
#    npx hardhat run scripts/finalizeResults.js --network sepolia
#
# To verify contracts on Etherscan, run:
#    npx hardhat verify --network sepolia <VERIFIER_ADDRESS>
#    npx hardhat verify --network sepolia <BALLOTBOX_ADDRESS> <VERIFIER_ADDRESS> <MERKLE_ROOT> <ELECTION_ID>
# ============================================
