# Step 1: Register voters
node scripts/registerVoters.js

# Step 2: Build Merkle Tree
node scripts/buildMerkleTree.js

# Step 3: Compile Circom circuit
circom ./circuits/BasicVote.circom --r1cs --wasm --sym -o build -l node_modules

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

# Step 7: Start local blockchain
npx hardhat node --hostname 127.0.0.1 --port 8547

# Step 8: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Step 9: Start voting phase
npx hardhat run scripts/startVoting.js --network localhost

# Step 10: Generate ZK proof
node scripts/generateProof.js

# Step 11: Submit ballot
npx hardhat run scripts/submitBallot.js --network localhost

# Step 12: End voting phase
npx hardhat run scripts/endVoting.js --network localhost

# Step 13: Reveal vote
npx hardhat run scripts/revealVote.js --network localhost

# Step 14: Finalize results
npx hardhat run scripts/finalizeResults.js --network localhost