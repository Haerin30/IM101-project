const { spawnSync } = require("node:child_process");

const files = [
    "src/app.js",
    "src/server.js",
    "src/db.js",
    "src/auth.js",
    "src/buildings.js",
    "tests/buildings.test.js",
    "tests/auth.test.js",
    "tests/rbac.test.js",
    "tests/provision-initial.test.js",
    "tests/verify-admin-login.test.js",
    "tests/reset-admin-password.test.js",
    "scripts/reset-admin-password.js",
    "scripts/provision-initial.js",
    "scripts/db-check.js",
    "scripts/check-syntax.js",
    "eslint.config.js",
];
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
