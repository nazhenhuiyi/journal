import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const pluginRoot = path.resolve(import.meta.dirname, "..");

const requiredFiles = [
  ".codex-plugin/plugin.json",
  "scripts/validate-journal-data.mjs",
  "skills/journal-tag-backfill/SKILL.md",
  "skills/journal-tag-backfill/agents/openai.yaml",
  "skills/journal-weekly-review/SKILL.md",
  "skills/journal-weekly-review/agents/openai.yaml",
];

function fail(message) {
  console.error(`journal-codex-plugin validate failed: ${message}`);
  process.exit(1);
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(pluginRoot, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`missing ${relativePath}`);
  }
}

const manifestPath = path.join(pluginRoot, ".codex-plugin/plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.name !== "journal-codex-plugin") {
  fail("plugin manifest name must be journal-codex-plugin");
}

if (manifest.skills !== "./skills/") {
  fail("plugin manifest must point skills to ./skills/");
}

for (const skillName of ["journal-tag-backfill", "journal-weekly-review"]) {
  const skillPath = path.join(pluginRoot, "skills", skillName, "SKILL.md");
  const body = await readFile(skillPath, "utf8");

  if (body.includes("TODO") || body.includes("[TODO")) {
    fail(`${skillName} still contains TODO placeholders`);
  }

  const frontmatter = body.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    fail(`${skillName} is missing YAML frontmatter`);
  }

  if (!new RegExp(`^name:\\s*${skillName}\\s*$`, "m").test(frontmatter[1])) {
    fail(`${skillName} frontmatter name is invalid`);
  }

  if (!/^description:\s*\S/m.test(frontmatter[1])) {
    fail(`${skillName} frontmatter description is missing`);
  }
}

console.log("journal-codex-plugin validate passed");
