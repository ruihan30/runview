import { scenario } from "../builders";
import { TASK } from "../text";

const TIMEOUT_MS = 90_000;

export default scenario(
  "slow-step",
  {
    seed: 5,
    description: "One test run hangs for 90 s and times out; the agent reruns a narrower set.",
    outcome: "success",
    verify: (run, key) => {
      const slow = run.steps.find((step) => step.id === key.failure);
      const took = (slow?.end ?? 0) - (slow?.start ?? 0);
      return took >= TIMEOUT_MS ? [] : [`the slow step lasts ${took} ms, expected at least ${TIMEOUT_MS}`];
    },
  },
  (s) => {
    s.user(TASK);
    s.think();
    const read = s.tool("read_file", { path: "src/filters/index.ts" });
    s.think();
    const edit = s.tool("edit_file", { path: "src/filters/index.ts", summary: "add dueBefore option" }, { causedBy: [read] });
    s.think();
    s.tool("write_file", { path: "tests/dueDate.test.ts" }, { causedBy: [edit] });
    s.explore(4);
    s.think("Running the full test suite.");
    const slow = s.tool(
      "run_tests",
      { watch: true },
      {
        status: "error",
        durationMs: TIMEOUT_MS,
        returns: " RUN  v3.1.0 /home/dev/todo-app\n\n ✓ tests/filters.test.ts (4 tests) 18ms\n ✓ tests/todos.test.ts (4 tests) 25ms\n\n Waiting for file changes...",
        error: "Timed out after 90 s: the test runner didn't exit (watch mode is on).",
      },
    );
    s.think("The run hung because of watch mode. I'll run the due-date tests only, without watch.", { causedBy: [slow] });
    s.tool("run_tests", { pattern: "dueDate", watch: false }, { causedBy: [slow] });
    s.message("Added the due-date filter. The full suite hung in watch mode, so I ran it without watch: all tests pass.");
    s.answerKey({ failure: slow, note: "The timed-out test run: 90 s in watch mode." });
  },
);
