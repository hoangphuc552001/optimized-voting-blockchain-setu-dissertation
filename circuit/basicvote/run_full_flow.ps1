# Zero-Knowledge Voting System - Full Flow Demo
# This script runs the complete voting flow:
# 1. Build Merkle Tree from voters.json
# 2. Compile Circom circuit
# 3. Setup trusted setup (phase 2)
# 4. Generate Solidity verifier
# 5. Deploy contracts to local blockchain
# 6. Generate ZK proof for a voter
# 7. Submit ballot to blockchain

param(
    [string]$voterName = "Alice",
    [int]$candidate = 2,
    [int]$vote = 1
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ZK Voting System - Complete Flow Demo" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build Merkle Tree
Write-Host "[Step 1] Building Merkle Tree from voters.json..." -ForegroundColor Yellow
cd $projectRoot
node scripts/buildMerkleTree.js
if ($LASTEXITCODE -ne 0) { throw "Failed to build Merkle tree" }
Write-Host "Merkle Tree built successfully!" -ForegroundColor Green
Write-Host ""

# Step 2: Compile Circom Circuit
Write-Host "[Step 2] Compiling Circom circuit..." -ForegroundColor Yellow
circom BasicVote.circom --r1cs --wasm --sym -o build -l node_modules
if ($LASTEXITCODE -ne 0) { throw "Failed to compile circuit" }
Write-Host "Circuit compiled successfully!" -ForegroundColor Green
Write-Host ""

# Step 3: Setup Trusted Setup (Phase 2)
Write-Host "[Step 3] Generating zkey (trusted setup)..." -ForegroundColor Yellow

# Check if powersoftau exists, if not create it
if (-not (Test-Path "build/pot15_final.ptau")) {
    Write-Host "Creating Powers of Tau..." -ForegroundColor Cyan
    snarkjs powersoftau new bn128 15 build/pot15_0000.ptau -v
    snarkjs powersoftau contribute build/pot15_0000.ptau build/pot15_0001.ptau --name="First contribution" -v -e="random entropy"
    snarkjs powersoftau prepare phase2 build/pot15_0001.ptau build/pot15_final.ptau -v
}

# Generate zkey
snarkjs groth16 setup build/BasicVote.r1cs build/pot15_final.ptau build/BasicVote_0000.zkey
snarkjs zkey contribute build/BasicVote_0000.zkey build/BasicVote_0001.zkey --name="Contributor 1" -v -e="more random entropy"
snarkjs zkey export verificationkey build/BasicVote_0001.zkey build/verification_key.json

Write-Host "Trusted setup complete!" -ForegroundColor Green
Write-Host ""

# Step 4: Generate Solidity Verifier
Write-Host "[Step 4] Generating Solidity verifier..." -ForegroundColor Yellow
snarkjs zkey export solidityverifier build/BasicVote_0001.zkey contracts/Verifier.sol
Write-Host "Solidity verifier generated!" -ForegroundColor Green
Write-Host ""

# Step 5: Deploy Contracts
Write-Host "[Step 5] Deploying contracts to local blockchain..." -ForegroundColor Yellow

# Start local Hardhat node in background
$hardhatJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npx hardhat node --hostname 127.0.0.1 --port 8547
} -ArgumentList $projectRoot

# Wait for node to start
Start-Sleep -Seconds 8

# Deploy
npx hardhat run scripts/deploy.js --network localhost
if ($LASTEXITCODE -ne 0) { throw "Failed to deploy contracts" }
Write-Host "Contracts deployed successfully!" -ForegroundColor Green
Write-Host ""

# Step 6: Generate ZK Proof
Write-Host "[Step 6] Generating ZK Proof for $voterName..." -ForegroundColor Yellow

# Read voter data
$votersData = Get-Content "$projectRoot\voters.json" | ConvertFrom-Json
$proofsData = Get-Content "$projectRoot\merkleProofs.json" | ConvertFrom-Json

$voter = $votersData.voters | Where-Object { $_.name -eq $voterName }
if (-not $voter) { throw "Voter $voterName not found" }

$voterProof = $proofsData.proofs | Where-Object { $_.name -eq $voterName }
if (-not $voterProof) { throw "Proof for $voterName not found" }

$merkleRoot = $proofsData.merkleRoot

# Generate proof using the Node.js script (handles Poseidon correctly)
node scripts/generateProof.js
if ($LASTEXITCODE -ne 0) { throw "Failed to generate proof" }

Write-Host "ZK Proof generated!" -ForegroundColor Green
Write-Host ""

# Step 7: Submit Ballot to Blockchain
Write-Host "[Step 7] Submitting ballot to blockchain..." -ForegroundColor Yellow

npx hardhat run scripts/submitBallot.js --network localhost
if ($LASTEXITCODE -ne 0) { throw "Failed to submit ballot" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Voting Flow Completed Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Summary
$proofData = Get-Content "$projectRoot\proof.json" | ConvertFrom-Json
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - Voter: $voterName"
Write-Host "  - Candidate: $candidate"
Write-Host "  - Vote: $vote"
Write-Host "  - Ballot Hash: $($proofData.ballotHash)"
Write-Host ""

# Cleanup
Stop-Job -Job $hardhatJob -ErrorAction SilentlyContinue
Remove-Job -Job $hardhatJob -ErrorAction SilentlyContinue
