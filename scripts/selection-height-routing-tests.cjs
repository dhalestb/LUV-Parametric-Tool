const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const register = path.join(__dirname, "ts-test-register.cjs");
const suites = [
  "src/components/selectionHeightRouting.test.ts",
  "src/components/selectionFieldGeometry.test.ts",
];

const result = spawnSync(
  process.execPath,
  ["--require", register, "--test", ...suites.map((file) => path.join(root, file))],
  { cwd: root, stdio: "inherit", env: process.env },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log("PASS: selection-height routing suites");
