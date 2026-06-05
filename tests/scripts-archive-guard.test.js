/**
 * Legacy patch scripts must live in archive only.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const scriptsDir = path.join(__dirname, "..", "scripts");
const archiveDir = path.join(scriptsDir, "archive");
const rootPatches = fs.readdirSync(scriptsDir).filter(f => f.startsWith("patch_") && f.endsWith(".py"));
const archived = fs.readdirSync(archiveDir).filter(f => f.startsWith("patch_") && f.endsWith(".py"));

assert.strictEqual(rootPatches.length, 0, "no patch_*.py in scripts/ root");
assert.ok(archived.length >= 20, "patch scripts should be archived");
assert.ok(fs.existsSync(path.join(archiveDir, "README.md")), "archive README required");

console.log("Scripts archive guard tests passed.");
