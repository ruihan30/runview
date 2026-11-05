import { scenario } from "../builders";
import { TASK } from "../text";

export default scenario(
  "happy-path",
  {
    seed: 1,
    description: "Baseline: the agent finds the right file, makes the change, and the tests pass.",
    outcome: "success",
  },
  (s) => {
    s.user(TASK);
    s.think("I should look at how filters are organised before changing anything.");
    const listing = s.tool("list_files", { path: "src/filters" });
    s.think();
    const read = s.tool("read_file", { path: "src/filters/index.ts" }, { causedBy: [listing] });
    s.think("filterTodos takes an options object. I'll add a dueBefore option next to status.");
    const edit = s.tool("edit_file", { path: "src/filters/index.ts", summary: "add dueBefore option" }, { causedBy: [read] });
    s.think();
    s.tool("run_tests", {}, { causedBy: [edit] });
    s.think("All green.");
    s.message("Added a `dueBefore` option to `filterTodos`. All 12 tests pass.");
    s.answerKey({ note: "Nothing planted; the baseline run." });
  },
);
