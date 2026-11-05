import { scenario } from "../builders";
import { BUILD_ERROR, TASK } from "../text";

const REPEATS = 8;
const BUILD_FAILED = "Command failed with exit code 2: npm run build";
const LOOP_THOUGHTS = [
  "Let me run the build again.",
  "Maybe the cache is stale. One more try.",
  "Trying the build once more.",
  "The build should pass now.",
];

export default scenario(
  "loop",
  {
    seed: 4,
    description: `The agent runs the same failing build ${REPEATS} times without changing anything.`,
    outcome: "failure",
    verify: (run) => {
      const calls = run.steps.filter((step) => step.type === "tool_call" && step.name === "run_command");
      const same = calls.filter((step) => JSON.stringify(step.input) === JSON.stringify(calls[0]?.input));
      const errors = run.steps.filter((step) => step.type === "tool_result" && step.error?.message === BUILD_FAILED);
      const problems: string[] = [];
      if (same.length < REPEATS) problems.push(`expected ${REPEATS} identical run_command calls, found ${same.length}`);
      if (errors.length < REPEATS) problems.push(`expected ${REPEATS} identical errors, found ${errors.length}`);
      return problems;
    },
  },
  (s) => {
    s.user(TASK);
    s.think();
    s.tool("read_file", { path: "src/filters/index.ts" });
    s.think("I'll put the due-date logic in its own file.");
    const edit = s.tool("edit_file", { path: "src/filters/dueDate.ts", summary: "new dueBefore filter" });
    s.explore(2);
    s.think("Let me check it compiles.");
    const builds: string[] = [];
    for (let i = 0; i < REPEATS; i++) {
      builds.push(
        s.tool(
          "run_command",
          { command: "npm run build" },
          { status: "error", returns: BUILD_ERROR, error: BUILD_FAILED, causedBy: i === 0 ? [edit] : undefined },
        ),
      );
      s.think(i === 0 ? "There's a type error. Let me run the build again to be sure." : s.rng.pick(LOOP_THOUGHTS));
    }
    s.message("The build keeps failing with TS2345 in src/filters/dueDate.ts. I wasn't able to fix it.");
    s.answerKey({
      failure: builds[1],
      cause: builds[0],
      note: "The loop starts at the first repeat: the same command, the same error, and nothing changed in between.",
    });
  },
);
