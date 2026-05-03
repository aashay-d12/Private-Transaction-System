const { existsSync, mkdirSync, readFileSync, rmSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { Worker, isMainThread, parentPort } = require("node:worker_threads");

const repoRoot = join(__dirname, "..");
const outputDir = join(repoRoot, "build", "circuits");
const expectedOutputs = [
  join(outputDir, "shielded_transfer.r1cs"),
  join(outputDir, "shielded_transfer.sym"),
  join(outputDir, "shielded_transfer_js", "shielded_transfer.wasm")
];

if (isMainThread) {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  let workerFinished = false;
  let workerFailed = false;
  let stableSignature = "";
  let stableChecks = 0;

  const worker = new Worker(__filename);
  worker.on("message", (message) => {
    if (message.type === "error") {
      workerFailed = true;
      console.error(message.error);
    }
  });
  worker.on("error", (error) => {
    workerFailed = true;
    console.error(error);
  });
  worker.on("exit", (code) => {
    workerFinished = true;
    if (code !== 0) {
      workerFailed = true;
    }
  });

  const poll = setInterval(() => {
    if (workerFailed) {
      clearInterval(poll);
      process.exit(1);
    }

    if (outputsExist()) {
      const signature = expectedOutputs
        .map((file) => `${statSync(file).size}:${statSync(file).mtimeMs}`)
        .join("|");

      stableChecks = signature === stableSignature ? stableChecks + 1 : 0;
      stableSignature = signature;

      if (stableChecks >= 2) {
        clearInterval(poll);
        worker.terminate().finally(() => process.exit(0));
      }
    }

    if (workerFinished && !outputsExist()) {
      clearInterval(poll);
      process.exit(1);
    }
  }, 500);
} else {
  compile().catch((error) => {
    parentPort.postMessage({ type: "error", error: error.stack ?? String(error) });
    process.exit(1);
  });
}

async function compile() {
  const { CircomRunner, bindings } = require("circom2");
  const circom = new CircomRunner({
    args: [
      "circuits/shielded_transfer.circom",
      "-l",
      "node_modules",
      "--r1cs",
      "--wasm",
      "--sym",
      "-o",
      "build/circuits"
    ],
    env: process.env,
    preopens: {
      ".": "."
    },
    bindings: {
      ...bindings,
      fs: require("node:fs"),
      exit(code) {
        process.exit(code);
      },
      kill(signal) {
        process.kill(process.pid, signal);
      }
    }
  });

  const wasm = readFileSync(require.resolve("circom2/circom.wasm"));
  await circom.execute(wasm);
}

function outputsExist() {
  return expectedOutputs.every((file) => existsSync(file) && statSync(file).size > 0);
}
