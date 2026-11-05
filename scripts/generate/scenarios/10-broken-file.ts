import { scenario } from "../builders";
import { TASK } from "../text";

// The run itself is fine. The writers damage the output files afterwards (see writers/corrupt.ts).
export default scenario(
  "broken-file",
  {
    seed: 10,
    description: "Invalid JSON on one line and a truncated last line. The parser should show a clear error.",
    outcome: "success",
    corrupt: true,
  },
  (s) => {
    s.user(TASK);
    s.think();
    const read = s.tool("read_file", { path: "src/filters/index.ts" });
    s.explore(2);
    s.think();
    const edit = s.tool("edit_file", { path: "src/filters/index.ts", summary: "add dueBefore option" }, { causedBy: [read] });
    s.think();
    s.tool("write_file", { path: "tests/dueDate.test.ts" }, { causedBy: [edit] });
    s.think();
    s.tool("run_tests", {});
    s.message("Added the due-date filter. All tests pass.");
    s.answerKey({ note: "The files are damaged on purpose; see `corruption` in samples/index.json for where." });
  },
);
