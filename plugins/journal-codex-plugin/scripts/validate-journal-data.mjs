import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const journalDataDir = args.dir ? path.resolve(args.dir) : null;
const errors = [];
const warnings = [];
const builtInThemeIds = new Set([
  "sky-now",
  "quick-photo",
  "small-thing",
  "today-three-lines",
  "food-today",
  "funny-today",
  "thought-maybe",
  "shower-thought",
  "breathe-moment",
  "light-shadow",
  "curious-colors",
  "sunrise-sunset",
  "season-report",
]);

if (!journalDataDir) {
  failUsage("Missing --dir <journalDataDir>.");
}

if (!existsSync(journalDataDir)) {
  failUsage(`journalDataDir does not exist: ${journalDataDir}`);
}

const insideGit = runGit(["rev-parse", "--is-inside-work-tree"]);
if (insideGit.status !== 0 || insideGit.stdout.trim() !== "true") {
  failUsage(`journalDataDir is not a git repository: ${journalDataDir}`);
}

const diffChecks = [
  ["git diff --check", runGit(["diff", "--check", "--", "entries", "reviews"])],
  ["git diff --cached --check", runGit(["diff", "--cached", "--check", "--", "entries", "reviews"])],
];

for (const [label, result] of diffChecks) {
  if (result.status !== 0) {
    errors.push(`${label} failed:\n${result.combined}`);
  }
}

const files = args.all ? await listAllJournalFiles(journalDataDir) : await listChangedJournalFiles();

for (const file of files) {
  await validateFile(file);
}

printResult(files);
process.exit(errors.length > 0 ? 1 : 0);

function parseArgs(argv) {
  const parsed = {
    all: false,
    dir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--all") {
      parsed.all = true;
      continue;
    }

    if (arg === "--dir") {
      parsed.dir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    failUsage(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function failUsage(message) {
  console.error(`journal data validation failed: ${message}`);
  console.error("Usage: node scripts/validate-journal-data.mjs --dir <journalDataDir> [--all]");
  process.exit(1);
}

function runGit(argsForGit) {
  const result = spawnSync("git", ["-C", journalDataDir, ...argsForGit], {
    encoding: "utf8",
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combined: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

async function listChangedJournalFiles() {
  const staged = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB", "--", "entries", "reviews"]);
  const unstaged = runGit(["diff", "--name-only", "--diff-filter=ACMRTUXB", "--", "entries", "reviews"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard", "--", "entries", "reviews"]);
  const values = new Set();

  for (const output of [staged.stdout, unstaged.stdout, untracked.stdout]) {
    for (const line of output.split(/\r?\n/)) {
      const file = normalizeRepoPath(line);
      if (isJournalFile(file)) {
        values.add(file);
      }
    }
  }

  return [...values].sort();
}

async function listAllJournalFiles(root) {
  const files = [];

  await collectFiles(path.join(root, "entries"), files);
  await collectFiles(path.join(root, "reviews"), files);

  return files
    .map((file) => normalizeRepoPath(path.relative(root, file)))
    .filter(isJournalFile)
    .sort();
}

async function collectFiles(directory, files) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of await readdir(directory)) {
    const absolutePath = path.join(directory, entry);
    const entryStat = await stat(absolutePath);

    if (entryStat.isDirectory()) {
      await collectFiles(absolutePath, files);
    } else if (entryStat.isFile()) {
      files.push(absolutePath);
    }
  }
}

function normalizeRepoPath(value) {
  return value.trim().replaceAll(path.sep, "/");
}

function isJournalFile(file) {
  return file.endsWith(".md") && (file.startsWith("entries/") || file.startsWith("reviews/"));
}

async function validateFile(file) {
  const absolutePath = path.join(journalDataDir, file);

  if (!existsSync(absolutePath)) {
    return;
  }

  const markdown = await readFile(absolutePath, "utf8");

  if (file.startsWith("entries/")) {
    validateEntryPath(file);
    validateEntryMarkdown(file, markdown);
    return;
  }

  if (file.startsWith("reviews/")) {
    validateReviewPath(file);
  }
}

function validateEntryPath(file) {
  const match = /^entries\/(\d{4})\/(\d{2})\/(\d{4})-(\d{2})-(\d{2})\.md$/.exec(file);

  if (!match) {
    errors.push(`${file}: entry path must match entries/YYYY/MM/YYYY-MM-DD.md`);
    return;
  }

  const [, yearDir, monthDir, year, month] = match;

  if (yearDir !== year || monthDir !== month) {
    errors.push(`${file}: entry path year/month must match file date`);
  }
}

function validateReviewPath(file) {
  if (/^reviews\/weekly\/\d{4}-W\d{2}\.md$/.test(file)) {
    return;
  }

  if (/^reviews\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/.test(file)) {
    return;
  }

  warnings.push(`${file}: review path is not a known default review path`);
}

function validateEntryMarkdown(file, markdown) {
  const content = markdown.replace(/\r\n/g, "\n");
  const { body, startLine } = validateFrontMatter(file, content);
  validateMurmurs(file, body, startLine);
}

function validateFrontMatter(file, markdown) {
  if (!markdown.startsWith("---\n")) {
    errors.push(`${file}: missing frontmatter`);
    return {
      body: markdown,
      startLine: 1,
    };
  }

  const lines = markdown.split("\n");
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (closingIndex === -1) {
    errors.push(`${file}: frontmatter missing closing ---`);
    return {
      body: markdown,
      startLine: 1,
    };
  }

  validateMetadataLines(file, "frontmatter", lines.slice(1, closingIndex), true);

  const bodyLines = lines.slice(closingIndex + 1);
  let startLine = closingIndex + 2;

  if (bodyLines[0] === "") {
    bodyLines.shift();
    startLine += 1;
  }

  return {
    body: bodyLines.join("\n"),
    startLine,
  };
}

function validateMurmurs(file, markdownBody, firstLineNumber) {
  const lines = markdownBody.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== ":::murmur") {
      continue;
    }

    const startLine = firstLineNumber + index;
    const endIndex = findClosingLine(lines, index + 1, ":::");

    if (endIndex === -1) {
      errors.push(`${file}:${startLine}: murmur block missing closing :::`);
      return;
    }

    const blockLines = lines.slice(index + 1, endIndex);
    const separatorIndex = blockLines.findIndex((line) => line.trim() === "---");
    const metadataLines = separatorIndex === -1 ? blockLines : blockLines.slice(0, separatorIndex);
    const bodyLines = separatorIndex === -1 ? [] : blockLines.slice(separatorIndex + 1);
    const bodyStartLine = separatorIndex === -1
      ? startLine + blockLines.length + 1
      : startLine + separatorIndex + 2;
    const metadata = parseFlatMetadata(file, `murmur at line ${startLine}`, metadataLines);

    if (!metadata.has("id")) {
      errors.push(`${file}:${startLine}: murmur missing id`);
    }

    if (!metadata.has("time")) {
      errors.push(`${file}:${startLine}: murmur missing time`);
    }

    if (metadata.has("themes")) {
      const themes = metadata.get("themes");

      if (!isArrayLiteral(themes)) {
        errors.push(`${file}:${startLine}: murmur themes must use [a, b] syntax`);
      } else {
        validateThemeIds(file, startLine, parseArrayItems(themes));
      }
    }

    validateImages(file, bodyLines, bodyStartLine);
    index = endIndex;
  }
}

function validateImages(file, lines, firstLineNumber) {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "::image") {
      continue;
    }

    const startLine = firstLineNumber + index;
    const endIndex = findClosingLine(lines, index + 1, "::");

    if (endIndex === -1) {
      errors.push(`${file}:${startLine}: image block missing closing ::`);
      return;
    }

    const metadata = parseFlatMetadata(file, `image at line ${startLine}`, lines.slice(index + 1, endIndex));

    if (!metadata.has("id")) {
      errors.push(`${file}:${startLine}: image missing id`);
    }

    if (!metadata.has("src")) {
      errors.push(`${file}:${startLine}: image missing src`);
    }

    if (metadata.has("tags") && !isArrayLiteral(metadata.get("tags"))) {
      errors.push(`${file}:${startLine}: image tags must use [a, b] syntax`);
    }

    index = endIndex;
  }
}

function validateMetadataLines(file, label, lines, allowNestedObjects) {
  let currentObjectKey = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (allowNestedObjects && currentObjectKey && /^ {2}[A-Za-z][\w-]*:\s*.*$/.test(line)) {
      const value = line.replace(/^ {2}[A-Za-z][\w-]*:\s*/, "");
      validateMetadataValue(file, `${label} line ${index + 2}`, value);
      continue;
    }

    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);

    if (!match) {
      errors.push(`${file}: ${label} line ${index + 1} is not key: value metadata`);
      continue;
    }

    currentObjectKey = match[2].trim() ? "" : match[1];
    validateMetadataValue(file, `${label} line ${index + 1}`, match[2]);
  }
}

function parseFlatMetadata(file, label, lines) {
  const metadata = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      continue;
    }

    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);

    if (!match) {
      errors.push(`${file}: ${label} metadata line ${index + 1} is not key: value metadata`);
      continue;
    }

    metadata.set(match[1], match[2].trim());
    validateMetadataValue(file, `${label} metadata line ${index + 1}`, match[2]);
  }

  return metadata;
}

function validateMetadataValue(file, label, rawValue) {
  const value = rawValue.trim();

  if (value.startsWith("[") && !isArrayLiteral(value)) {
    errors.push(`${file}: ${label} array must use [a, b] syntax`);
  }
}

function isArrayLiteral(value) {
  return /^\[[^\]\r\n]*\]$/.test(value.trim());
}

function parseArrayItems(value) {
  const inner = value.trim().slice(1, -1).trim();

  if (!inner) {
    return [];
  }

  return inner.split(",").map((item) => item.trim());
}

function validateThemeIds(file, line, themeIds) {
  for (const themeId of themeIds) {
    if (!themeId) {
      errors.push(`${file}:${line}: murmur themes contains an empty theme id`);
      continue;
    }

    if (!builtInThemeIds.has(themeId)) {
      errors.push(`${file}:${line}: unknown murmur theme id "${themeId}"`);
    }
  }
}

function findClosingLine(lines, startIndex, marker) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim() === marker) {
      return index;
    }
  }

  return -1;
}

function printResult(files) {
  if (errors.length === 0) {
    console.log("journal data validation passed");
  } else {
    console.error("journal data validation failed");
  }

  console.log(`Checked files: ${files.length}`);

  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }

  for (const error of errors) {
    console.error(`error: ${error}`);
  }
}
