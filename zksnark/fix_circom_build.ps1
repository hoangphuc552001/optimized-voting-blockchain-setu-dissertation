Write-Host "=== Circom Build Fix for Windows ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking Rust installation..." -ForegroundColor Yellow
$rustcVersion = & rustc --version 2>&1
$cargoVersion = & cargo --version 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Rust is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Rust from: https://rustup.rs/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Rust: $rustcVersion" -ForegroundColor Green
Write-Host "Cargo: $cargoVersion" -ForegroundColor Green
Write-Host ""

Write-Host "Checking for MSVC compiler..." -ForegroundColor Yellow
$msvcPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
$vsPath = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC"
$vsEnterprise = "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"

$msvcFound = $false
if (Test-Path $msvcPath) {
    Write-Host "Found Visual Studio Build Tools 2022" -ForegroundColor Green
    $msvcFound = $true
} elseif (Test-Path $vsPath) {
    Write-Host "Found Visual Studio Community 2022" -ForegroundColor Green
    $msvcFound = $true
} elseif (Test-Path $vsEnterprise) {
    Write-Host "Found Visual Studio Enterprise 2022" -ForegroundColor Green
    $msvcFound = $true
} else {
    Write-Host "MSVC compiler not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUTION OPTIONS:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Option 1: Install Visual Studio Build Tools (Recommended)" -ForegroundColor Yellow
    Write-Host "  1. Download: https://visualstudio.microsoft.com/downloads/" -ForegroundColor White
    Write-Host "  2. Select 'Build Tools for Visual Studio 2022'" -ForegroundColor White
    Write-Host "  3. During installation, check 'Desktop development with C++'" -ForegroundColor White
    Write-Host "  4. After installation, restart your terminal and try building again" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 2: Use Pre-built Binary (Easier!)" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://github.com/iden3/circom/releases" -ForegroundColor White
    Write-Host "  2. Get 'circom-windows-amd64.exe'" -ForegroundColor White
    Write-Host "  3. Rename to 'circom.exe' and add to PATH" -ForegroundColor White
    Write-Host ""
    exit 1
}

if ($msvcFound) {
    Write-Host ""
    Write-Host "MSVC found, but build still failing. Trying to configure Rust toolchain..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Setting up MSVC toolchain..." -ForegroundColor Yellow
    
    $toolchain = & rustup show default 2>&1 | Select-String -Pattern "default" | ForEach-Object { $_.Line }
    Write-Host "Current toolchain: $toolchain" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "Try running these commands:" -ForegroundColor Yellow
    Write-Host "  rustup toolchain install stable-x86_64-pc-windows-msvc" -ForegroundColor White
    Write-Host "  rustup default stable-x86_64-pc-windows-msvc" -ForegroundColor White
    Write-Host ""
    Write-Host "Then try building circom again:" -ForegroundColor Yellow
    Write-Host "  cargo build --release" -ForegroundColor White
}

