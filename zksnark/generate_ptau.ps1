Write-Host "=== Generating Powers of Tau File ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will generate a small Powers of Tau file using snarkjs." -ForegroundColor Yellow
Write-Host "Note: For production, use a trusted setup ceremony file." -ForegroundColor Yellow
Write-Host ""

if (-not (Get-Command snarkjs -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: snarkjs is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Install with: npm install -g snarkjs" -ForegroundColor Yellow
    exit 1
}

Write-Host "Step 1: Creating new Powers of Tau (this may take a minute)..." -ForegroundColor Yellow
snarkjs powersoftau new bn128 10 pot10_0000.ptau -v

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create Powers of Tau" -ForegroundColor Red
    exit 1
}

Write-Host "Step 2: Contributing to Powers of Tau..." -ForegroundColor Yellow
snarkjs powersoftau contribute pot10_0000.ptau pot10_0001.ptau --name="First contribution" -v -e="random text"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to contribute" -ForegroundColor Red
    exit 1
}

Write-Host "Step 3: Second contribution..." -ForegroundColor Yellow
snarkjs powersoftau contribute pot10_0001.ptau pot10_0002.ptau --name="Second contribution" -v -e="another random text"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed second contribution" -ForegroundColor Red
    exit 1
}

Write-Host "Step 4: Applying random beacon..." -ForegroundColor Yellow
snarkjs powersoftau beacon pot10_0002.ptau powersOfTau28_hez_final_10.ptau 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to apply beacon" -ForegroundColor Red
    exit 1
}

Write-Host "Step 5: Cleaning up temporary files..." -ForegroundColor Yellow
Remove-Item pot10_0000.ptau -ErrorAction SilentlyContinue
Remove-Item pot10_0001.ptau -ErrorAction SilentlyContinue
Remove-Item pot10_0002.ptau -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Successfully generated powersOfTau28_hez_final_10.ptau!" -ForegroundColor Green
Write-Host "You can now run: .\setup.ps1" -ForegroundColor Cyan

