# Blockchain Voting System

A simple L1 Ethereum voting system built with Solidity, Hardhat, and ethers.js.

## Features

- **Election Creation**: Admin can create elections with multiple candidates
- **Voter Registration**: Whitelist-based voter registration system
- **Secure Voting**: One vote per registered address during voting period
- **Real-time Results**: Automatic tallying and winner determination
- **Time-bound Elections**: Configurable start and end times

## Smart Contract

The `Election` contract provides:
- Admin-only election management
- Voter registration (individual and batch)
- Secure voting with multiple safeguards
- Event emission for transparency
- Winner calculation after voting ends

## Quick Start (Recommended)

For the fastest way to get everything running:

```bash
# 1. Install dependencies
npm install

# 2. Create basic .env file
echo "# Local Development Configuration
# Leave SEPOLIA_RPC_URL commented out for local development
# SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Default Hardhat private key (first account)
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Latest deployed contract address on localhost:8545
ELECTION_ADDRESS=

# API Server Configuration
PORT=3001

# Uncomment for Sepolia testnet deployment
# ETHERSCAN_API_KEY=your_etherscan_api_key" > .env

# 3. Start local blockchain (Terminal 1)
npm run node

# 4. Run quick setup (Terminal 2) - This does everything!
npm run quick-start

# Alternative: Manual deployment to running network
# npm run deploy:local  # Always deploys to localhost:8545

# 5. Start backend API (Terminal 3)
npm run server:dev

# 6. Open frontend in browser
# Visit: public/index.html
# OR: npx http-server public -p 8080
# OR: cd public && python -m http.server 8080
```

That's it! The quick-start script will:
- ✅ Deploy an election contract to your local Hardhat network
- ✅ Register test voters automatically
- ✅ Display all connection details
- ✅ Provide next-step instructions

**Note**: Use `npm run deploy:local` for guaranteed deployment to your running Hardhat node, avoiding "contract not found" errors.

## Detailed End-to-End Setup & Running Guide

If you prefer step-by-step control, follow these detailed instructions:

### Step 1: Environment Setup
```bash
# Install all dependencies
npm install

# Create environment file for local development
# Create a file named .env with these contents:
echo "# Local Development Configuration
SEPOLIA_RPC_URL=http://localhost:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ELECTION_ADDRESS=" > .env

# For Sepolia testnet (optional - uncomment and fill in your details):
# SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
# PRIVATE_KEY=your_private_key_without_0x_prefix
# ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Step 2: Compile & Test Smart Contracts
```bash
# Compile the smart contracts
npm run compile

# Run all unit tests (should see 21 passing tests)
npm test
```

### Step 3: Start Local Blockchain (Option A: Local Network)
```bash
# Terminal 1: Start Hardhat local network
npm run node

# Keep this running - it provides a local Ethereum network
```

### Step 4: Deploy Election Contract
```bash
# Terminal 2: Deploy the election contract to your running Hardhat node
npm run deploy:local

# Alternative: Use the legacy command (may create temporary network)
npm run deploy

# You should see output like:
# Election contract deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
#
# Copy this address for the next steps and update ELECTION_ADDRESS in .env
```

### Step 5: Register Voters
```bash
# Update the ELECTION_ADDRESS in your .env file with the deployed address
# Then register some test voters:

# Register individual voters
npm run manage register 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

# Or register multiple voters at once
npm run manage register 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x90F79bf6EB2c4f870365E785982E1f101E93b906
```

### Step 6: Start Backend API Server
```bash
# Terminal 3: Start the backend server
npm run server:dev

# You should see:
# Election backend server running on port 3001
# Connected to network: Local
```

### Step 7: Test the API (Optional)
```bash
# Terminal 4: Test API endpoints

# Health check
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"2025-01-01T12:00:00.000Z"}

# Deploy a new election (replace with your contract address)
curl -X POST http://localhost:3001/elections \
  -H "Content-Type: application/json" \
  -d '{
    "candidates": ["Alice Johnson", "Bob Smith", "Charlie Brown"],
    "startTime": 1640995200,
    "endTime": 1641081600
  }'

# Get election status
curl http://localhost:3001/elections/YOUR_ELECTION_ADDRESS/status

# Get election results
curl http://localhost:3001/elections/YOUR_ELECTION_ADDRESS/results

# Get winner (only works after election ends)
curl http://localhost:3001/elections/YOUR_ELECTION_ADDRESS/winner

# Register voters
curl -X POST http://localhost:3001/elections/YOUR_ELECTION_ADDRESS/voters \
  -H "Content-Type: application/json" \
  -d '{
    "voters": [
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
    ]
  }'

# Check if voter is registered
curl http://localhost:3001/elections/YOUR_ELECTION_ADDRESS/voters/0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Cast a vote (backend-assisted voting)
curl -X POST http://localhost:3001/elections/YOUR_ELECTION_ADDRESS/vote \
  -H "Content-Type: application/json" \
  -d '{
    "voterAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "candidateId": 0
  }'

# Example with actual contract address (replace with yours):
# curl http://localhost:3001/elections/0x5FbDB2315678afecb367f032d93F642f64180aa3/status
# Response: {"admin":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","startTime":1738176319,"endTime":1738176379,"isActive":false,"totalCandidates":3,"totalRegisteredVoters":0,"timeUntilStart":0,"timeUntilEnd":0}
```

### Step 8: Use the Frontend
```bash
# Open public/index.html in your browser
# OR serve it with a simple HTTP server:
npx http-server public -p 8080

# Then visit: http://localhost:8080

# Troubleshooting:
# - "ethers is not defined": Refresh the page (CDN loading issue)
# - "MetaMask not detected": Install/unlock MetaMask
# - "Contract not found": Check ELECTION_ADDRESS in public/index.html
# - "Not registered": Register your wallet via API first
```

### Step 9: Cast Votes via Frontend
1. **Connect MetaMask** to your local network (http://localhost:8545)
2. **Import test accounts** (from Hardhat node output)
3. **Vote for candidates** using the interface
4. **Watch results update** in real-time

### Step 10: Monitor Election Events
```bash
# Terminal 5: Start monitoring for real-time updates
npm run monitor start YOUR_ELECTION_ADDRESS

# You should see live updates when votes are cast
```

### Step 11: Check Final Results
```bash
# Check election status
npm run manage status

# View final results
npm run manage results

# Get winner (after election ends)
npm run manage winner
```

## Alternative: Testnet Deployment

If you want to deploy to Sepolia testnet instead:

### Setup for Sepolia
```bash
# 1. Get test ETH from Sepolia faucet: https://sepoliafaucet.com/
# 2. Get Infura project ID: https://infura.io/
# 3. Update .env file:
echo "# Sepolia Testnet Configuration
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your_private_key_without_0x_prefix
ETHERSCAN_API_KEY=your_etherscan_api_key" > .env

# 4. Deploy to Sepolia
npm run deploy:sepolia

# 5. Use Sepolia management commands
npm run manage:sepolia register 0x... 0x...
npm run manage:sepolia status
```

### Frontend on Testnet
- Update the `ELECTION_ADDRESS` in `public/index.html`
- Connect MetaMask to Sepolia testnet
- Use real test accounts with test ETH

## Troubleshooting

### Common Issues:

**"WARNING: Calling an account which is not a contract"**
- **Problem**: Contract deployed to temporary network, API connecting to different network
- **Solution**: Use `npm run deploy:local` instead of `npm run deploy`
- **Prevention**: Always start Hardhat node (`npm run node`) before deploying

**"Contract deployment failed"**
- Make sure Hardhat node is running (`npm run node`)
- Check your private key in .env file
- Try `npm run deploy:local` for guaranteed local deployment

**"MetaMask can't connect"**
- Make sure you're connected to the right network
- For local: http://localhost:8545
- For Sepolia: Sepolia testnet in MetaMask

**"Vote transaction failed"**
- Make sure the voter is registered
- Check election timing (must be during voting period)
- Verify the account has enough ETH for gas

**"Frontend shows no candidates"**
- Update the `ELECTION_ADDRESS` constant in `public/index.html`
- Make sure the contract is deployed and accessible

### Debug Commands:
```bash
# Check contract compilation
npm run compile

# Run specific tests
npx hardhat test --grep "should allow registered voters to vote"

# Check network connection
curl $SEPOLIA_RPC_URL \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Deployment

### Local Development (Recommended)
```bash
# Start Hardhat node first
npm run node

# Deploy to the running local network
npm run deploy:local

# Alternative: Legacy command (may create temporary network)
npm run deploy
```

### Sepolia Testnet
```bash
npm run deploy:sepolia
```

## Election Management

### Register Voters
```bash
npm run manage register 0xVoter1Address 0xVoter2Address 0xVoter3Address
```

### Check Election Status
```bash
npm run manage status
```

### View Results
```bash
npm run manage results
```

### Get Winner
```bash
npm run manage winner
```

## Backend API

The backend provides RESTful APIs for election management:

### Election Management
- `POST /elections` - Deploy new election contract
- `GET /elections/:address/status` - Get election status
- `GET /elections/:address/results` - Get current vote results
- `GET /elections/:address/winner` - Get election winner

### Voter Management
- `POST /elections/:address/voters` - Register voters
- `GET /elections/:address/voters/:voterAddress` - Check voter registration
- `POST /elections/:address/vote` - Cast vote (backend-assisted)

### Monitoring
- Real-time event monitoring via WebSocket
- Historical event queries
- Periodic status updates

## Frontend

A simple HTML/JavaScript frontend (`public/index.html`) that:
- Connects to MetaMask wallet
- Displays election status and candidates
- Allows registered voters to cast votes
- Shows real-time results
- Displays winner when election ends

## Performance Analysis Tools

For your dissertation research on L1 vs L2/ZK voting performance:

### Basic Performance Testing
```bash
# Run basic performance tests (10, 100, 1000 voters)
npm run performance

# Run on Sepolia testnet (gas limits apply)
npm run performance:sepolia
```

### Advanced Performance Analysis
```bash
# Run comprehensive analysis with detailed metrics
npm run performance:analysis

# Run on Sepolia testnet
npm run performance:analysis:sepolia
```

### Metrics Captured

**Gas Analysis:**
- Per-vote gas consumption
- Total election gas costs
- Gas efficiency trends
- Cost projections in ETH/USD

**Latency Metrics:**
- Transaction confirmation times
- Block propagation delays
- Network response times
- End-to-end latency

**Throughput Analysis:**
- Votes per second (VPS)
- Peak vs sustained throughput
- Block utilization rates
- Congestion impact measurement

**Scalability Testing:**
- Success/failure rates
- Performance degradation under load
- Network congestion effects
- Resource utilization patterns

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run node` | Start local Hardhat blockchain network |
| `npm run compile` | Compile Solidity smart contracts |
| `npm run test` | Run unit tests |
| `npm run test:gas` | Run tests with gas reporting |
| `npm run quick-start` | One-click setup: deploy contract + register voters |
| `npm run deploy:local` | Deploy to running Hardhat node (recommended) |
| `npm run deploy` | Deploy to default network (may create temporary network) |
| `npm run deploy:sepolia` | Deploy to Sepolia testnet |
| `npm run manage` | Election management utilities (local) |
| `npm run manage:sepolia` | Election management utilities (Sepolia) |
| `npm run performance` | Run basic performance tests |
| `npm run performance:sepolia` | Run performance tests on Sepolia |
| `npm run performance:analysis` | Advanced performance analysis |
| `npm run server:dev` | Start backend API server with auto-reload |
| `npm run server` | Start backend API server |
| `npm run monitor` | Start election monitoring service |
| `npm run coverage` | Generate test coverage reports |

## Project Structure

```
├── contracts/          # Solidity smart contracts
│   └── Election.sol
├── scripts/            # Deployment and management scripts
│   ├── deploy.ts                 # Contract deployment
│   ├── manage-election.ts        # Election management utilities
│   └── quick-start.ts           # One-click setup script
├── analysis/           # Performance analysis scripts
│   ├── comparison/              # L1 vs L2 comparison benchmarks
│   │   ├── l1-vs-l2-benchmark.ts
│   │   ├── l1-vs-l2-100k.ts
│   │   └── l1-vs-l2-1m.ts
│   ├── l1-metrics/              # L1-only deep analysis
│   │   ├── l1-detailed-metrics.ts
│   │   └── l1-load-test.ts
│   └── visualization/           # Gas visualization tools
│       ├── benchmark-l2.ts
│       ├── visualize-gas.ts
│       └── analyze-gas.ts
├── src/                # Backend TypeScript source
│   ├── server.ts       # Express server
│   ├── monitor.ts      # Election monitoring service
│   └── services/
│       └── ElectionService.ts
├── public/             # Frontend files
│   └── index.html
├── test/               # Unit tests
│   └── Election.test.ts
├── hardhat.config.ts   # Hardhat configuration
├── tsconfig.json       # TypeScript configuration
├── package.json        # Dependencies and scripts
└── .env                # Environment configuration
```

## Security Features

- Admin-only election management
- One-vote-per-address enforcement
- Time-bound voting periods
- Input validation and require guards
- Event logging for transparency
- No external calls in vote function (reentrancy protection)

## Testing

The project includes comprehensive unit tests covering:
- Contract deployment validation
- Voter registration logic
- Voting security and constraints
- Results calculation
- Edge cases and error conditions

Run tests with gas reporting:
```bash
npm run test:gas
```

## Architecture Notes

This is an L1-only implementation focused on core voting functionality. Future enhancements could include:
- Zero-knowledge proofs for voter privacy
- Layer 2 scaling solutions
- Multi-signature admin controls
- Decentralized storage for voter lists
#   L 1 V o t i n g B l o c k c h a i n S y s t e m 
 
 