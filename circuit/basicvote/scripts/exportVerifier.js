const fs = require("fs");
const { execSync } = require("child_process");

async function main() {
    console.log("Exporting verifier from zkey...");
    
    // Export Solidity verifier
    execSync("npx snarkjs zkey export solidityverifier build/BasicVote_0001.zkey contracts/Verifier.sol", {
        cwd: "d:\\setu\\Dissertation\\project\\circuit\\basicvote",
        stdio: "inherit"
    });
    
    console.log("Verifier exported to contracts/Verifier.sol");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
