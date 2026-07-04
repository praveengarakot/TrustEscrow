import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const network = process.env.STELLAR_NETWORK || "testnet";
const sourceAccount = process.env.STELLAR_ACCOUNT || "alice";

const ledgerWasmPath = path.join(
  rootDir,
  "target",
  "wasm32v1-none",
  "release",
  "focus_forge.wasm"
);

const rewardsWasmPath = path.join(
  rootDir,
  "target",
  "wasm32v1-none",
  "release",
  "focus_forge_rewards.wasm"
);

if (!fs.existsSync(ledgerWasmPath) || !fs.existsSync(rewardsWasmPath)) {
  console.error("Contract WASMs not found. Run `npm run contract:build` first.");
  process.exit(1);
}

// Helper to deploy
function deployContract(wasmPath, alias) {
  const args = [
    "contract",
    "deploy",
    "--wasm",
    wasmPath,
    "--source-account",
    sourceAccount,
    "--network",
    network,
  ];
  if (alias) {
    args.push("--alias", alias);
  }
  try {
    const output = execFileSync("stellar", args, {
      cwd: rootDir,
      encoding: "utf8"
    }).trim();
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const contractId = lines[lines.length - 1];
    if (!contractId.startsWith("C")) {
      throw new Error(`Invalid contract ID parsed: ${contractId}`);
    }
    return contractId;
  } catch (err) {
    console.error(`Failed to deploy ${alias || wasmPath}:`, err.message);
    throw err;
  }
}

console.log("Deploying FocusForgeRewards...");
const rewardsContractId = deployContract(rewardsWasmPath, "focus_forge_rewards_" + Date.now().toString().slice(-4));
console.log(`Deployed FocusForgeRewards to: ${rewardsContractId}`);

console.log("Deploying FocusForge (ledger)...");
const ledgerContractId = deployContract(ledgerWasmPath, "focus_forge_" + Date.now().toString().slice(-4));
console.log(`Deployed FocusForge to: ${ledgerContractId}`);

// Get admin address
const adminAddress = execFileSync("stellar", ["keys", "address", sourceAccount], {
  encoding: "utf8"
}).trim();
console.log(`Admin address: ${adminAddress}`);

console.log("Initializing FocusForgeRewards...");
execFileSync("stellar", [
  "contract",
  "invoke",
  "--id",
  rewardsContractId,
  "--source-account",
  sourceAccount,
  "--network",
  network,
  "--",
  "initialize",
  "--admin",
  ledgerContractId
], { cwd: rootDir, stdio: "inherit" });

console.log("Initializing FocusForge...");
execFileSync("stellar", [
  "contract",
  "invoke",
  "--id",
  ledgerContractId,
  "--source-account",
  sourceAccount,
  "--network",
  network,
  "--",
  "initialize",
  "--admin",
  adminAddress,
  "--rewards_contract",
  rewardsContractId
], { cwd: rootDir, stdio: "inherit" });

const deploymentsDir = path.join(rootDir, "deployments");
fs.mkdirSync(deploymentsDir, { recursive: true });

const deploymentRecord = {
  contractName: "FocusForge",
  contractId: ledgerContractId,
  rewardsContractId: rewardsContractId,
  network,
  sourceAccount,
  deployedAt: new Date().toISOString()
};

fs.writeFileSync(
  path.join(deploymentsDir, `${network}.json`),
  JSON.stringify(deploymentRecord, null, 2)
);

console.log("\nDeployment completed successfully!");
console.log(`Ledger ID: ${ledgerContractId}`);
console.log(`Rewards ID: ${rewardsContractId}`);
