/**
 * Launch the demo server against the Sepolia testnet.
 *
 * A tiny wrapper rather than an inline env assignment, because `VAR=x node ...`
 * is not valid syntax in cmd.exe or PowerShell and this repo runs on Windows.
 *
 *   npm run demo:sepolia                    reuse the deployed election
 *   SEPOLIA_DEPLOY=1 npm run demo:sepolia   deploy a fresh one (costs testnet ETH)
 */

process.env.DEMO_NETWORK = "sepolia";
require("./server.js");
