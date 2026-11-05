import { scenario, type ScenarioBuilder, type ScenarioOptions } from "../builders";
import { TASK } from "../text";

// The most important scenario: realistic, hard, and the best usability-test task.
// A search returns the legacy file first; the agent edits the wrong file and the tests fail much later.

const SEARCH_HITS = [
  "src/legacy/filter.ts:3:export function filterTodos(todos: Todo[], status: Status) {",
  "src/legacy/filter.ts:11:  // old filter, kept for the v1 import screen",
  "src/filters/index.ts:8:export function filterTodos(todos: Todo[], options: FilterOptions) {",
  "src/components/FilterBar.tsx:21:  const visible = filterTodos(todos, { status, dueBefore });",
].join("\n");

export const silentBadResultOptions: Omit<ScenarioOptions, "description"> = {
  seed: 3,
  outcome: "failure",
  verify: (run, key) => {
    const problems: string[] = [];
    const index = (id?: string) => run.steps.findIndex((step) => step.id === id);
    const gap = index(key.failure) - index(key.cause);
    if (gap < 10) problems.push(`failure should come well after the cause, but the gap is ${gap} steps`);
    const usesSearch = run.steps.some((step) => step.name === "edit_file" && step.causedBy?.includes(key.cause ?? ""));
    if (!usesSearch) problems.push("no edit_file step is caused by the bad search");
    return problems;
  },
};

export function silentBadResult(s: ScenarioBuilder): void {
  s.user(TASK);
  s.think("I need to find where todos get filtered.");
  s.tool("list_files", { path: "src" });
  s.think();
  const search = s.tool("search", { query: "filterTodos" }, { returns: SEARCH_HITS });
  s.think("The first hit, src/legacy/filter.ts, defines filterTodos. I'll add the due-date logic there.", { causedBy: [search] });
  const read = s.tool("read_file", { path: "src/legacy/filter.ts" }, { causedBy: [search] });
  s.think();
  const edit = s.tool("edit_file", { path: "src/legacy/filter.ts", summary: "add dueBefore parameter" }, { causedBy: [search, read] });
  s.think("Now the filter bar needs a date input.");
  s.tool("read_file", { path: "src/components/FilterBar.tsx" });
  s.think();
  s.tool("edit_file", { path: "src/components/FilterBar.tsx", summary: "add due-date input" }, { causedBy: [edit] });
  s.explore(2);
  const testFile = s.tool("write_file", { path: "tests/dueDate.test.ts" }, { causedBy: [edit] });
  const noTokens = s.think();
  s.omit(noTokens, "tokens"); // a gap in the data, as in real logs
  s.tool("run_command", { command: "npm run lint" });
  s.think();
  const tests = s.tool("run_tests", {}, { status: "error", durationMs: 34_000 });
  s.think("The new test fails: the filter returns all 5 todos. Let me re-read the test.", { causedBy: [tests] });
  s.tool("read_file", { path: "tests/dueDate.test.ts" }, { causedBy: [testFile] });
  s.explore(3);
  s.think("Maybe the date comparison is wrong. I'll parse the dates instead of comparing strings.");
  s.tool("edit_file", { path: "src/legacy/filter.ts", summary: "parse dates before comparing" }, { causedBy: [tests] });
  s.think();
  s.tool("run_tests", {}, { status: "error" });
  s.explore(2);
  s.tool("run_tests", {}, { status: "error" });
  s.message("I couldn't get the due-date test to pass: the filter still returns every todo. The logic in src/legacy/filter.ts looks right, so the test setup may be the problem.");
  s.answerKey({
    failure: tests,
    cause: search,
    note: "The search lists src/legacy/filter.ts first. The app imports src/filters/index.ts, so the edits never take effect.",
  });
}

export default scenario(
  "silent-bad-result",
  { ...silentBadResultOptions, description: "A search returns the wrong file; the agent edits it; the tests fail much later." },
  silentBadResult,
);
