import { scenario } from "../builders";
import { FILES, PROGRESS, TASK, testLog } from "../text";

const MIN_STEPS = 500;
const MAX_STEPS = 1_000;

export default scenario(
  "large-run",
  {
    seed: 8,
    description: "A long run of mixed steps with one failure in the middle, for performance and scroll tests.",
    outcome: "success",
    verify: (run) => {
      const n = run.steps.length;
      return n >= MIN_STEPS && n <= MAX_STEPS ? [] : [`expected ${MIN_STEPS}–${MAX_STEPS} steps, got ${n}`];
    },
  },
  (s) => {
    s.user(TASK);
    let failure = "";
    let cause = "";

    for (let i = 0; i < 200; i++) {
      if (i === 40) {
        s.think("I'll split the review across two sub-agents.");
        s.parallel([
          { name: "review-ui", task: "Review the UI components for filter state.", summary: "UI looks fine.", body: (a) => a.explore(6) },
          { name: "review-tests", task: "Review test coverage for filters.", summary: "Coverage gaps in sorting.", body: (a) => a.explore(6) },
        ]);
        continue;
      }
      if (i === 100) {
        s.think("I'll make date parsing use local time so it matches the UI.");
        cause = s.tool("edit_file", { path: "src/utils/dates.ts", summary: "parse dates in local time" });
        s.think();
        failure = s.tool("run_tests", {}, { status: "error", returns: testLog(false, s.rng) });
        s.think("Local time shifts dates across midnight. Back to UTC.", { causedBy: [failure] });
        s.tool("edit_file", { path: "src/utils/dates.ts", summary: "parse dates as UTC" }, { causedBy: [failure] });
        continue;
      }

      const roll = s.rng.next();
      if (roll < 0.55) {
        s.explore(1);
      } else if (roll < 0.75) {
        s.think();
        s.tool("edit_file", { path: s.rng.pick(FILES), summary: "small refactor" });
      } else if (roll < 0.85) {
        s.think();
        s.tool("run_command", { command: s.rng.pick(["npm run lint", "npm run build", "git status", "git diff --stat"]) });
      } else if (roll < 0.93) {
        s.think();
        s.tool("run_tests", {});
      } else {
        s.message(s.rng.pick(PROGRESS));
      }
    }

    s.message("Done: due-date filter, UI input, and tests for the edge cases.");
    s.answerKey({ failure, cause, note: "The one failure: a switch to local-time parsing breaks a test; reverted to UTC." });
  },
);
