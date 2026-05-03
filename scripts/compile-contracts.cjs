const { mkdirSync } = require("node:fs");
const { join } = require("node:path");

const repoRoot = join(__dirname, "..");
const hardhatHome = join(repoRoot, ".hardhat-home");
mkdirSync(hardhatHome, { recursive: true });

process.env.APPDATA = hardhatHome;
process.env.LOCALAPPDATA = hardhatHome;
process.env.XDG_CONFIG_HOME = hardhatHome;
process.argv = [process.argv[0], "hardhat", "compile"];

require("hardhat/internal/cli/cli");
