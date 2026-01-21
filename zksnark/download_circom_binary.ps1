Write-Host "=== Downloading Pre-built Circom Binary ===" -ForegroundColor Cyan
Write-Host ""

$releasesUrl = "https://api.github.com/repos/iden3/circom/releases/latest"
Write-Host "Fetching latest release information..." -ForegroundColor Yellow

try {
    $release = Invoke-RestMethod -Uri $releasesUrl -Headers @{"Accept"="application/vnd.github.v3+json"}
    
    $asset = $release.assets | Where-Object { $_.name -like "*windows*amd64*" -or $_.name -like "*circom*.exe" } | Select-Object -First 1
    
    if (-not $asset) {
        Write-Host "Could not find Windows binary in latest release." -ForegroundColor Red
        Write-Host "Please manually download from: https://github.com/iden3/circom/releases" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "Found: $($asset.name)" -ForegroundColor Green
    Write-Host "Download URL: $($asset.browser_download_url)" -ForegroundColor Cyan
    Write-Host ""
    
    $downloadPath = "circom.exe"
    Write-Host "Downloading to: $downloadPath" -ForegroundColor Yellow
    
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $downloadPath
    
    Write-Host "Download complete!" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "Adding to PATH..." -ForegroundColor Yellow
    $binDir = "$env:USERPROFILE\bin"
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir | Out-Null
    }
    
    $targetPath = Join-Path $binDir "circom.exe"
    Move-Item -Path $downloadPath -Destination $targetPath -Force
    
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$binDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binDir", "User")
        Write-Host "Added $binDir to PATH" -ForegroundColor Green
        Write-Host "Please restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
    } else {
        Write-Host "$binDir already in PATH" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Installation complete!" -ForegroundColor Green
    Write-Host "After restarting terminal, verify with: circom --version" -ForegroundColor Cyan
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual download:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://github.com/iden3/circom/releases" -ForegroundColor White
    Write-Host "2. Download 'circom-windows-amd64.exe'" -ForegroundColor White
    Write-Host "3. Rename to 'circom.exe'" -ForegroundColor White
    Write-Host "4. Add to PATH" -ForegroundColor White
}

