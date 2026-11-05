import { scenario } from "../builders";
import { TASK, fileContents } from "../text";

const BIG_FILE = "src/data/seed-todos.json";

export default scenario(
  "token-blowup",
  {
    seed: 7,
    description: "Reading a huge seed-data file multiplies the input tokens of every later model call.",
    outcome: "success",
    verify: (run, key) => {
      const at = run.steps.findIndex((step) => step.id === key.cause);
      const before = run.steps.slice(0, at).filter((step) => step.tokens && step.parentId === null).at(-1);
      const after = run.steps.slice(at).find((step) => step.tokens && step.parentId === null);
      if (!before?.tokens || !after?.tokens) return ["couldn't find model calls around the large read"];
      return after.tokens.input > 2 * before.tokens.input
        ? []
        : [`input tokens only went from ${before.tokens.input} to ${after.tokens.input}`];
    },
  },
  (s) => {
    s.user(TASK);
    s.think();
    s.tool("list_files", { path: "src" });
    s.think("There's a seed data file. Let me read it to see what a todo looks like.");
    const big = s.tool("read_file", { path: BIG_FILE }, { returns: fileContents(BIG_FILE, s.rng, 2_500) });
    s.think("Each todo has an ISO dueDate string. That's all I needed from that file.", { causedBy: [big] });
    s.explore(4);
    s.think();
    const edit = s.tool("edit_file", { path: "src/filters/index.ts", summary: "add dueBefore option" });
    s.think();
    s.tool("write_file", { path: "tests/dueDate.test.ts" }, { causedBy: [edit] });
    s.explore(1);
    s.think();
    s.tool("run_tests", {});
    s.message("Added the due-date filter with tests. Everything passes.");
    s.answerKey({
      cause: big,
      note: "The 2,500-line read stays in context, so every later model call pays for it. The run succeeds but costs far more than it should.",
    });
  },
);
