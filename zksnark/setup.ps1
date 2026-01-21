Write-Host "Step 1: Compiling circuit..."
circom circuit.circom --r1cs --wasm --sym

if (-not (Test-Path "powersOfTau28_hez_final_10.ptau")) {
    Write-Host "Step 2: Downloading Powers of Tau file..."
    
    $ptauUrls = @(
        "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_10.ptau",
        "https://www.trusted-setup-pse.org/semaphore/setup_2^10/powersOfTau28_hez_final_10.ptau",
        "https://ipfs.io/ipfs/QmNf1UsmdGaMbpatQ6toXSkzDpizaGmUS9h5TqbLVHsoHs"
    )
    
    $downloadSuccess = $false
    foreach ($url in $ptauUrls) {
        try {
            Write-Host "Trying: $url" -ForegroundColor Yellow
            Invoke-WebRequest -Uri $url -OutFile "powersOfTau28_hez_final_10.ptau" -ErrorAction Stop
            Write-Host "Download successful!" -ForegroundColor Green
            $downloadSuccess = $true
            break
        } catch {
            Write-Host "Failed: $_" -ForegroundColor Red
            continue
        }
    }
    
    if (-not $downloadSuccess) {
        Write-Host ""
        Write-Host "Automatic download failed. Please download manually:" -ForegroundColor Yellow
        Write-Host "1. Visit: https://github.com/iden3/snarkjs#7-prepare-phase-2" -ForegroundColor White
        Write-Host "2. Or use snarkjs to download:" -ForegroundColor White
        Write-Host "   snarkjs powersoftau new bn128 10 pot10_0000.ptau -v" -ForegroundColor Cyan
        Write-Host "   snarkjs powersoftau contribute pot10_0000.ptau pot10_0001.ptau --name='First contribution' -v" -ForegroundColor Cyan
        Write-Host "   snarkjs powersoftau contribute pot10_0001.ptau pot10_0002.ptau --name='Second contribution' -v" -ForegroundColor Cyan
        Write-Host "   snarkjs powersoftau beacon pot10_0002.ptau powersOfTau28_hez_final_10.ptau 010203 10 -n='Final Beacon'" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Or download from IPFS using:" -ForegroundColor Yellow
        Write-Host "   ipfs get QmNf1UsmdGaMbpatQ6toXSkzDpizaGmUS9h5TqbLVHsoHs -o powersOfTau28_hez_final_10.ptau" -ForegroundColor Cyan
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "Step 2: Powers of Tau file already exists, skipping download..."
}

$preparedPtau = "powersOfTau28_hez_final_10_prepared.ptau"
if (-not (Test-Path $preparedPtau)) {
    Write-Host "Step 3: Preparing Powers of Tau for circuit..."
    snarkjs powersoftau prepare phase2 powersOfTau28_hez_final_10.ptau $preparedPtau -v
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to prepare Powers of Tau file" -ForegroundColor Red
        Write-Host "The ptau file may be corrupted. Try regenerating it with: .\generate_ptau.ps1" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "Step 3: Prepared Powers of Tau file already exists, skipping preparation..."
}

Write-Host "Step 4: Running Groth16 setup..."
snarkjs groth16 setup circuit.r1cs $preparedPtau circuit_0000.zkey

Write-Host "Step 5: Exporting verification key..."
snarkjs zkey export verificationkey circuit_0000.zkey verification_key.json

Write-Host "Setup complete! You can now run: node snark.js"

