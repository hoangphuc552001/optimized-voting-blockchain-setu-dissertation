require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {
      blockGasLimit: 30_000_000_000,
      allowUnlimitedContractSize: true
    },
    localhost: {
      chainId: 31337,
      url: "http://127.0.0.1:8547"
    },
    sepolia: {
      url: process.env.ALCHEMY_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  mocha: {
    timeout: 600000
  }
};
