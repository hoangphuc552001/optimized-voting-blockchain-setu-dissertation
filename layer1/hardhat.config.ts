import 'dotenv/config';
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ? process.env.SEPOLIA_RPC_URL : undefined,
      accounts: process.env.PRIVATE_KEY
        ? [
            process.env.PRIVATE_KEY.startsWith("0x")
              ? process.env.PRIVATE_KEY
              : `0x${process.env.PRIVATE_KEY}`,
          ]
        : undefined,
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
