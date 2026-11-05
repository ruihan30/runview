import { scenario } from "../builders";
import { TASK } from "../text";

export default scenario(
  "error-recovery",
  {
    seed: 2,
    description: "read_file on a wrong path fails; the agent lists the folder and recovers.",
    outcome: "success",
  },
  (s) => {
    s.user(TASK);
    s.think("The filter code is probably in src/filter/. Let me read it.");
    const bad = s.tool("read_file", { path: "src/filter/dueDate.ts" }, { status: "error" });
    s.think("That path doesn't exist. I'll list src to find the right folder.", { causedBy: [bad] });
    const listing = s.tool("list_files", { path: "src" }, { causedBy: [bad] });
    s.think("It's src/filters, plural.");
    const read = s.tool("read_file", { path: "src/filters/index.ts" }, { causedBy: [listing] });
    s.explore(2);
    s.think();
    const edit = s.tool("edit_file", { path: "src/filters/index.ts", summary: "add dueBefore option" }, { causedBy: [read] });
    s.think();
    s.tool("write_file", { path: "tests/dueDate.test.ts" }, { causedBy: [edit] });
    s.think();
    s.tool("run_tests", {});
    s.message("Added the due-date filter and four tests. Everything passes.");
    s.answerKey({ failure: bad, note: "The failed read on a wrong path; the agent recovers on its own." });
  },
);
