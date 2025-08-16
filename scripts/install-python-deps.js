// scripts/install-python-deps.js
const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with code ${res.status}`);
  }
}

// Preferred Python executable on Windows is 'py', otherwise 'python3'.
function detectPython() {
  const candidates = process.platform === "win32"
    ? ["py", "python", "python3"]
    : ["python3", "python"];
  for (const exe of candidates) {
    const res = spawnSync(exe, ["--version"], { stdio: "ignore" });
    if (res.status === 0) return exe;
  }
  throw new Error("Python not found. Please install Python 3.10+ and make it available in PATH.");
}

function main() {
  const py = detectPython();
  const pipArgs = ["-m", "pip"];
  // Ensure latest pip (silently fail if pip is not installed)
  spawnSync(py, [...pipArgs, "install", "-U", "pip"], { stdio: "inherit" });

  // Always install required packages
  // --force-reinstall --no-cache-dir to force replacement
  run(py, [...pipArgs, "install", "--force-reinstall", "--no-cache-dir",
           'pymupdf>=1.24', "pillow", "pytesseract"]);

  // Optional dependencies: install if requirements.txt exists
  const req = path.resolve(process.cwd(), "requirements.txt");
  if (existsSync(req)) {
    run(py, [...pipArgs, "install", "-r", req]);
  }
}

try {
  main();
  console.log("[postinstall] Python dependencies installed.");
} catch (e) {
  console.error("[postinstall] Failed to install Python dependencies:", e.message);
  process.exit(1);
}
