// npm run gen: runs every scenario through the checks and every writer, into samples/.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkScenario } from "./checks";
import { scenarios } from "./scenarios";
import { writeClaudeCode } from "./writers/claude-code";
import { corrupt, type Corruption } from "./writers/corrupt";
import { writeNormalised } from "./writers/normalised";
import { writeOtel } from "./writers/otel";

const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "samples");

// 1. Check everything first. Write nothing if any check fails.
const problems = scenarios.flatMap((s) => checkScenario(s).map((p) => `${s.name}: ${p}`));
if (problems.length > 0) {
  console.error(`✗ ${problems.length} problem(s); nothing written:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// 2. Write the samples. The folder is generated, so start clean.
rmSync(SAMPLES, { recursive: true, force: true });
mkdirSync(SAMPLES, { recursive: true });

const manifest = [];
for (const s of scenarios) {
  const outputs: Array<[format: string, extension: string, content: string | null]> = [
    ["normalised", "run.json", writeNormalised(s.run)],
    ["claude-code", "claude-code.jsonl", writeClaudeCode(s.run)],
    ["otel", "otel.json", writeOtel(s.run, s.seed)],
  ];

  const files: Record<string, string> = {};
  const corruption: Record<string, Corruption> = {};
  for (const [format, extension, content] of outputs) {
    if (content === null) continue;
    const file = `${s.name}.${extension}`;
    let out = content;
    if (s.corrupt) {
      const damaged = corrupt(content);
      out = damaged.text;
      corruption[format] = damaged.info;
    }
    writeFileSync(join(SAMPLES, file), out);
    files[format] = file;
  }

  manifest.push({
    name: s.name,
    description: s.description,
    outcome: s.run.outcome,
    steps: s.run.steps.length,
    untimed: s.untimed,
    files,
    answerKey: s.answerKey,
    ...(s.corrupt ? { corruption } : {}),
  });
  console.log(`✓ ${s.name.padEnd(18)} ${String(s.run.steps.length).padStart(4)} steps  → ${Object.keys(files).join(", ")}`);
}

writeFileSync(join(SAMPLES, "index.json"), JSON.stringify({ scenarios: manifest }, null, 2) + "\n");
console.log(`\nWrote ${scenarios.length} scenarios to samples/. Claude Code JSONL is skipped until writers/claude-code.ts is written.`);
