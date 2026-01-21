# Building Circom on Windows

## Method 1: Build from Source (Recommended)

### Prerequisites

1. **Install Rust:**
   - Download and install Rust from: https://rustup.rs/
   - Or use PowerShell:
     ```powershell
     # Download and run rustup-init
     Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "rustup-init.exe"
     .\rustup-init.exe
     ```
   - Follow the installation prompts
   - Restart your terminal/PowerShell after installation

2. **Install Git:**
   - Download from: https://git-scm.com/download/win
   - Or use winget:
     ```powershell
     winget install Git.Git
     ```

3. **Install Visual Studio Build Tools (for C++ compiler):**
   - Download "Build Tools for Visual Studio" from: https://visualstudio.microsoft.com/downloads/
   - During installation, select "Desktop development with C++" workload
   - Or install Visual Studio Community with C++ support

### Build Steps

1. **Clone the Circom repository:**
   ```powershell
   git clone https://github.com/iden3/circom.git
   cd circom
   ```

2. **Build Circom:**
   ```powershell
   cargo build --release
   ```
   This will take several minutes (5-15 minutes depending on your system).

3. **Add to PATH:**
   The compiled binary will be at: `target\release\circom.exe`
   
   You can either:
   
   **Option A: Add to PATH permanently**
   ```powershell
   # Get the full path
   $circomPath = (Resolve-Path "target\release\circom.exe").Path
   $circomDir = Split-Path $circomPath -Parent
   
   # Add to user PATH (permanent)
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$circomDir", "User")
   ```
   Then restart your terminal.
   
   **Option B: Install globally with Cargo**
   ```powershell
   cargo install --path .
   ```
   This installs to `%USERPROFILE%\.cargo\bin\circom.exe`
   
   Make sure `%USERPROFILE%\.cargo\bin` is in your PATH (usually added automatically by rustup).

4. **Verify installation:**
   ```powershell
   circom --version
   ```

## Method 2: Use Pre-built Binary (Faster)

1. **Download pre-built binary:**
   - Go to: https://github.com/iden3/circom/releases
   - Download `circom-windows-amd64.exe` (or appropriate version for your system)
   - Rename it to `circom.exe`

2. **Add to PATH:**
   ```powershell
   # Create a bin directory (or use existing)
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\bin"
   
   # Move circom.exe there
   Move-Item circom.exe "$env:USERPROFILE\bin\circom.exe"
   
   # Add to PATH
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:USERPROFILE\bin", "User")
   ```

3. **Verify:**
   ```powershell
   circom --version
   ```

## Troubleshooting

### "cargo: command not found"
- Make sure Rust is installed and PATH is updated
- Restart your terminal after installing Rust
- Verify with: `cargo --version`

### Build errors related to C++ compiler
- Install Visual Studio Build Tools with C++ support
- Or install Visual Studio Community with "Desktop development with C++"

### "linker not found" errors
- Install Microsoft C++ Build Tools
- Or install Visual Studio with C++ support

### Permission errors
- Run PowerShell as Administrator if needed
- Check that you have write permissions in the directory

## Quick Check Commands

```powershell
# Check Rust installation
rustc --version
cargo --version

# Check Git
git --version

# Check Circom (after installation)
circom --version
```

