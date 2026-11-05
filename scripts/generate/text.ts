// Filler content for the made-up to-do app: code, logs, errors, thoughts.
// Everything here is invented. Never paste real code, paths or logs in here.

import type { Rng } from "./random";

export const TASK = "Add a due-date filter to the to-do app and make the tests pass";
export const ROOT = "/home/dev/todo-app";

export const FILES = [
  "package.json",
  "src/App.tsx",
  "src/components/TodoList.tsx",
  "src/components/TodoItem.tsx",
  "src/components/FilterBar.tsx",
  "src/state/todos.ts",
  "src/state/persist.ts",
  "src/filters/index.ts",
  "src/filters/status.ts",
  "src/legacy/filter.ts",
  "src/utils/dates.ts",
  "tests/filters.test.ts",
  "tests/todos.test.ts",
] as const;

export const QUERIES = ["filterTodos", "dueDate", "FilterOptions", "useTodos", "status ===", "describe("];

/** Rough token count: about 4 characters per token. */
export function approxTokens(value: unknown): number {
  if (value === undefined) return 0;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(s.length / 4);
}

const THOUGHTS = [
  "I should check how filters are wired up before changing anything.",
  "The filter bar holds its own state, so the new option needs to go there too.",
  "Due dates look like ISO date strings, e.g. 2026-03-01.",
  "I'll keep the change small: one new option and one new input.",
  "There's already a status filter; the due-date filter can follow the same shape.",
  "Before editing, let me confirm which file the app actually imports.",
  "The tests use a fixed list of five todos, which makes the expected counts easy to work out.",
  "I need to handle todos with no due date: they should stay visible.",
  "Let me look at the existing tests to match their style.",
  "That looks right. Next, the UI.",
  "I'll run the tests now to see where things stand.",
  "The lint config is strict about unused imports, so I'll clean those up.",
  "Comparing date strings works for ISO dates, but parsing them is safer.",
  "This helper is only used in one place, so I can change it without side effects.",
];

export function thought(rng: Rng): string {
  const count = rng.int(1, 3);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(rng.pick(THOUGHTS));
  return parts.join(" ");
}

export const PROGRESS = [
  "The filter logic is in place. Moving on to the UI.",
  "Lint passes. I'll add tests for the edge cases next.",
  "Quick status: the option works in the filter function; the UI still needs a date input.",
  "Tests are green so far. I'll tidy up before finishing.",
];

// ---------------------------------------------------------------- code files

const FN_NAMES = ["filterTodos", "byStatus", "byDueDate", "sortTodos", "groupByDay", "isOverdue", "visibleTodos"];
const FIELDS = ["done", "dueDate", "title", "createdAt", "priority"];
const COMMENTS = [
  "keep todos without a due date visible",
  "ISO strings compare correctly as plain strings",
  "TODO: move this into the filters module",
  "stable order matters for the list animation",
  "called on every keystroke, so keep it cheap",
];

function codeFile(path: string, lines: number, rng: Rng): string {
  const out = [`// ${path}`, `import type { Todo } from "../state/todos";`, ""];
  while (out.length < lines) {
    const fn = rng.pick(FN_NAMES);
    const field = rng.pick(FIELDS);
    out.push(
      `export function ${fn}(todos: Todo[], value: string): Todo[] {`,
      `  // ${rng.pick(COMMENTS)}`,
      `  const result = todos.filter((t) => t.${field} ${rng.pick(["===", "!==", "<=", ">="])} value);`,
      `  return result;`,
      `}`,
      "",
    );
  }
  return out.slice(0, lines).join("\n");
}

const TITLES = ["Buy milk", "Book dentist", "Renew passport", "Water plants", "Pay rent", "Call plumber", "Write report"];
const TAGS = ["home", "work", "errands", "health"];

function jsonData(lines: number, rng: Rng): string {
  const out = ["["];
  for (let i = 1; out.length < lines - 1; i++) {
    const due = `2026-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
    out.push(
      `  { "id": ${i}, "title": "${rng.pick(TITLES)} #${i}", "done": ${rng.chance(0.4)}, "dueDate": "${due}", "tags": ["${rng.pick(TAGS)}"] },`,
    );
  }
  out[out.length - 1] = out[out.length - 1].replace(/,$/, "");
  out.push("]");
  return out.join("\n");
}

/** Plausible contents for a project file. Pass `lines` for a specific length (e.g. a huge file). */
export function fileContents(path: string, rng: Rng, lines = rng.int(15, 160)): string {
  if (path === "package.json") {
    return [
      "{",
      '  "name": "todo-app",',
      '  "version": "0.3.0",',
      '  "scripts": { "dev": "vite", "build": "tsc -p tsconfig.json && vite build", "test": "vitest run", "lint": "eslint src tests" }',
      "}",
    ].join("\n");
  }
  return path.endsWith(".json") ? jsonData(lines, rng) : codeFile(path, lines, rng);
}

export function listing(dir: string): string {
  const prefix = dir.replace(/\/$/, "") + "/";
  const entries = new Set<string>();
  for (const file of FILES) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    entries.add(rest.includes("/") ? rest.split("/")[0] + "/" : rest);
  }
  return [...entries].sort().join("\n");
}

export function searchResults(query: string, rng: Rng): string {
  const hits = rng.int(2, 6);
  const out: string[] = [];
  for (let i = 0; i < hits; i++) {
    out.push(`${rng.pick(FILES)}:${rng.int(1, 120)}:  const matches = ${query}(todos, options);`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- logs

const TEST_CASES: Array<[file: string, name: string]> = [
  ["tests/filters.test.ts", "shows all todos by default"],
  ["tests/filters.test.ts", "hides completed todos"],
  ["tests/filters.test.ts", "shows only completed todos"],
  ["tests/filters.test.ts", "keeps the original order"],
  ["tests/todos.test.ts", "adds a todo"],
  ["tests/todos.test.ts", "toggles a todo"],
  ["tests/todos.test.ts", "removes a todo"],
  ["tests/todos.test.ts", "persists to local storage"],
  ["tests/dueDate.test.ts", "shows todos due on or before the date"],
  ["tests/dueDate.test.ts", "keeps todos without a due date"],
  ["tests/dueDate.test.ts", "hides todos due after the date"],
  ["tests/dueDate.test.ts", "treats an empty date as no filter"],
];

export interface TestFailure {
  file: string;
  test: string;
  expected: string;
  received: string;
  line: number;
  source: string;
}

export const DEFAULT_FAILURE: TestFailure = {
  file: "tests/dueDate.test.ts",
  test: "hides todos due after the date",
  expected: "2",
  received: "5",
  line: 15,
  source: 'expect(filterTodos(todos, { dueBefore: "2026-03-01" })).toHaveLength(2);',
};

export function testLog(passed: boolean, rng: Rng, failure: TestFailure = DEFAULT_FAILURE): string {
  const out = ["", ` RUN  v3.1.0 ${ROOT}`, ""];
  let failedCount = 0;
  for (const [file, name] of TEST_CASES) {
    const failed = !passed && file === failure.file && name === failure.test;
    if (failed) failedCount++;
    out.push(` ${failed ? "×" : "✓"} ${file} > ${name} ${rng.int(1, 40)}ms`);
  }
  if (!passed) {
    out.push(
      "",
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      "",
      ` FAIL  ${failure.file} > ${failure.test}`,
      `AssertionError: expected [ …(${failure.received}) ] to have a length of ${failure.expected} but got ${failure.received}`,
      "",
      `- Expected   ${failure.expected}`,
      `+ Received   ${failure.received}`,
      "",
      ` ❯ ${failure.file}:${failure.line}:${rng.int(10, 40)}`,
      `     ${failure.line - 1}|   it("${failure.test}", () => {`,
      `     ${failure.line}|     ${failure.source}`,
      `       |     ^`,
      `     ${failure.line + 1}|   });`,
    );
  }
  const total = TEST_CASES.length;
  out.push(
    "",
    ` Test Files  ${passed ? 3 : 1} passed${passed ? "" : " | 1 failed"} (3)`,
    `      Tests  ${total - failedCount} passed${passed ? "" : ` | ${failedCount} failed`} (${total})`,
    `   Duration  ${rng.range(1.2, 9.5).toFixed(2)}s`,
  );
  return out.join("\n");
}

export const BUILD_ERROR = [
  "> todo-app@0.3.0 build",
  "> tsc -p tsconfig.json && vite build",
  "",
  "src/filters/dueDate.ts:12:27 - error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
  "  Type 'undefined' is not assignable to type 'string'.",
  "",
  "12   return todos.filter((t) => isBefore(t.dueDate, options.dueBefore));",
  "                             ~~~~~~~~~",
  "",
  "Found 1 error in src/filters/dueDate.ts:12",
].join("\n");

export function commandOutput(command: string, ok: boolean, rng: Rng): string {
  if (command.includes("build")) {
    if (!ok) return BUILD_ERROR;
    return [
      "> todo-app@0.3.0 build",
      "> tsc -p tsconfig.json && vite build",
      "",
      `✓ ${rng.int(40, 60)} modules transformed.`,
      "dist/index.html                  0.46 kB",
      `dist/assets/index-${rng.hex(8)}.js   ${rng.range(130, 150).toFixed(1)} kB`,
      `✓ built in ${rng.range(1, 4).toFixed(2)}s`,
    ].join("\n");
  }
  if (command.includes("lint")) {
    const header = "> todo-app@0.3.0 lint\n> eslint src tests\n";
    if (ok) return header;
    return `${header}\n${ROOT}/src/filters/index.ts\n  3:10  error  'isBefore' is defined but never used  @typescript-eslint/no-unused-vars\n\n✖ 1 problem (1 error, 0 warnings)`;
  }
  if (command.startsWith("git status")) {
    return "On branch feature/due-date-filter\nChanges not staged for commit:\n\tmodified:   src/filters/index.ts\n\tmodified:   src/components/FilterBar.tsx";
  }
  if (command.startsWith("git diff")) {
    return ` src/components/FilterBar.tsx | ${rng.int(5, 30)} ++++++--\n src/filters/index.ts         | ${rng.int(3, 20)} +++++-\n 2 files changed`;
  }
  return ok ? "" : `sh: 1: ${command.split(" ")[0]}: not found`;
}
