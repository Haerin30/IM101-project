const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function javascriptFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
            ? javascriptFiles(path)
            : path.endsWith(".js")
              ? [path]
              : [];
    });
}

const files = [
    "eslint.config.js",
    ...["src", "prisma", "scripts", "tests"].flatMap(javascriptFiles),
];

for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
