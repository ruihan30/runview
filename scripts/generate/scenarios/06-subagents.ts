import { scenario } from "../builders";
import { TASK, testLog } from "../text";

export default scenario(
  "subagents",
  {
    seed: 6,
    description: "Three sub-agents run in parallel; one fails and the parent carries on with its bad guess.",
    outcome: "failure",
    verify: (run, key) => {
      const sub = run.steps.find((step) => step.id === key.cause);
      const problems: string[] = [];
      if (sub?.type !== "subagent" || sub.status !== "error") problems.push("the cause should be a failed subagent step");
      const subs = run.steps.filter((step) => step.type === "subagent");
      const overlap = subs.every((a) => subs.some((b) => a !== b && (a.start ?? 0) < (b.end ?? 0) && (b.start ?? 0) < (a.end ?? 0)));
      if (!overlap) problems.push("sub-agents should overlap in time");
      return problems;
    },
  },
  (s) => {
    s.user(TASK);
    s.think("Three things to find out first: how the UI filters, how due dates are stored, and how the tests run. I'll hand those to sub-agents.");

    const [ui, dates] = s.parallel([
      {
        name: "explore-ui",
        task: "Find how the filter bar passes filters to the todo list.",
        summary: "FilterBar keeps the filter state and calls filterTodos from src/filters/index.ts.",
        body: (a) => {
          a.explore(5);
          a.tool("read_file", { path: "src/components/FilterBar.tsx" });
          a.message("FilterBar keeps the filter state and calls filterTodos from src/filters/index.ts.");
        },
      },
      {
        name: "explore-dates",
        task: "Find out how due dates are stored on a todo.",
        summary: "I couldn't find the storage code. Due dates are probably Unix timestamps in seconds.",
        status: "error",
        error: "Sub-agent hit its step limit before finding the storage code",
        body: (a) => {
          a.think("Storage is probably in src/state/storage.ts.");
          a.tool("read_file", { path: "src/state/storage.ts" }, { status: "error" });
          a.think();
          a.tool("search", { query: "dueDate" });
          a.explore(4);
          a.think("I'll assume Unix timestamps in seconds; that's common.");
          a.message("I couldn't find the storage code. Due dates are probably Unix timestamps in seconds.");
        },
      },
      {
        name: "explore-tests",
        task: "Find how the tests are set up and how to run them.",
        summary: "Tests use Vitest with a fixed list of five todos. Run them with npm test.",
        body: (a) => {
          a.explore(4);
          a.tool("read_file", { path: "tests/filters.test.ts" });
          a.message("Tests use Vitest with a fixed list of five todos. Run them with npm test.");
        },
      },
    ]);

    s.think("Due dates are Unix timestamps, so I'll compare numbers.", { causedBy: [dates] });
    const edit = s.tool("edit_file", { path: "src/filters/index.ts", summary: "compare dueDate as seconds" }, { causedBy: [dates, ui] });
    s.think();
    s.tool("write_file", { path: "tests/dueDate.test.ts" }, { causedBy: [edit] });
    s.explore(1);
    s.think();
    const tests = s.tool(
      "run_tests",
      {},
      {
        status: "error",
        returns: testLog(false, s.rng, {
          file: "tests/dueDate.test.ts",
          test: "shows todos due on or before the date",
          expected: "3",
          received: "0",
          line: 9,
          source: 'expect(filterTodos(todos, { dueBefore: "2026-03-01" })).toHaveLength(3);',
        }),
      },
    );
    s.message("The due-date test returns no todos. The comparison may need adjusting for time zones.");
    s.answerKey({
      failure: tests,
      cause: dates,
      note: "The explore-dates sub-agent failed and guessed 'Unix timestamps'. Due dates are ISO strings, so every comparison is false.",
    });
  },
);
