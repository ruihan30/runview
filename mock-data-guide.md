# Mock data guide

## Approach

Write a small script that generates fake agent runs from scenarios, rather than writing JSON by hand. Each scenario plants a known problem, so the data doubles as test cases and as usability-test material.

There are two layers:

1. **Normalised runs:** data already in your own run model. Build these first; they let you build every view before any parser exists.
2. **Source-format files:** the same runs written out as Claude Code JSONL or OpenTelemetry JSON. These test the adapters and feed the "drop a file" demo.

Order of work: run model → scenarios → generator for normalised runs → views → source-format writers → adapters. No AI calls anywhere; the generator is plain, seeded code.

## Step 1: Define the run model

Write the types before any data: every scenario, adapter and view depends on them. A starting point to adjust:

```ts
type StepType =
  | "user"        // the task or a user message
  | "thinking"    // model reasoning
  | "message"     // model text reply
  | "tool_call"   // e.g. read_file, run_command
  | "tool_result"
  | "subagent";   // a container for a nested run

type StepStatus = "ok" | "error" | "cancelled";

interface Step {
  id: string;
  parentId: string | null;    // sub-agent steps point at their subagent step
  type: StepType;
  name: string;               // tool name, or a short label
  start?: number;             // ms since run start; optional for untimed runs
  end?: number;
  status: StepStatus;
  tokens?: { input: number; output: number };
  input?: unknown;            // tool arguments, prompt text
  output?: unknown;           // tool result, reply text
  error?: { message: string };
  causedBy?: string[];        // step ids whose output this step used
}

interface Run {
  id: string;
  source: "claude-code" | "otel" | "trajectory" | "synthetic";
  task: string;
  outcome: "success" | "failure" | "unknown";
  steps: Step[];              // flat list, ordered by start (or by position if untimed)
}
```

Two choices worth noting in the case study:

- **A flat list with `parentId`,** not nested objects. It's easier to virtualise, filter and search, and you build the tree only when a view needs it.
- **`causedBy`** is what a graph view would draw. Include it now even if the graph stays a stretch goal.

## Step 2: Write the scenarios

Start with 10 scenarios, each one a design or performance question the viewer must handle. Every scenario stores an **answer key**: the step that fails and the step that caused it.

Use one generic made-up task throughout, e.g. *"Add a due-date filter to a to-do app and make the tests pass"*, so steps read naturally.

| # | Scenario | Size | What's planted | Answer key |
| --- | --- | --- | --- | --- |
| 1 | Happy path | ~15 steps | Nothing; the baseline | Outcome: success |
| 2 | Error and recovery | ~25 | `read_file` on a wrong path fails, agent retries correctly | The failed call; recovered |
| 3 | Silent bad result | ~60 | A search returns the wrong file; the agent edits it; tests fail ~15 steps later | Failure = test run; cause = the search |
| 4 | Loop | ~40 | Same command repeated 8 times with the same error | The first repeat |
| 5 | Slow step | ~30 | One test run takes 90 s and times out | The timed-out call |
| 6 | Sub-agents | ~80 | 3 sub-agents in parallel; one fails, the parent carries on with bad data | The failing sub-agent step |
| 7 | Token blow-up | ~35 | Reading a huge file multiplies the input tokens of every later model call | The large read |
| 8 | Large run | 500–1,000 | Mixed steps, one failure in the middle | For performance and scroll tests |
| 9 | Untimed | = scenario 3 | Timestamps removed | Same as 3 |
| 10 | Broken file | ~20 | Invalid JSON on one line, truncated last line | Parser shows a clear error |

Scenario 3 is the most important: it's the realistic, hard case and the best usability-test task.

## Step 3: Make it realistic

Fake data that's too tidy hides design problems, so build in the mess of real runs. Check these rules against one of your own side-project sessions; the numbers below are rough starting guesses.

- **Rhythm:** runs follow think → call → result → think, with occasional text replies. Avoid long runs of one type.
- **Durations vary a lot:** thinking a few seconds; file reads and searches well under a second; test runs and builds tens of seconds. Pick from a range, not a fixed value, and add rare outliers.
- **Tokens grow over time:** each model call's input tokens include the conversation so far, so they rise through the run. Output tokens stay small and spiky.
- **Parallel work overlaps:** sub-agent steps sit inside their parent's time span and overlap each other.
- **Text has realistic lengths:** short commands, medium code snippets, and some very long tool outputs (a 2,000-line file, a long test log) to test truncation.
- **Errors look like real errors:** stack traces, "No such file or directory", non-zero exit codes, not just `"error"`.
- **Gaps exist:** small idle gaps between steps, and one or two steps with missing fields.

## Step 4: Write the generator

A TypeScript script in the repo, run with `npm run gen`, that turns scenario definitions into files. Use a **seeded** random number generator so the same seed always produces the same run; tests and screenshots then stay stable.

**Folder layout**

```
scripts/generate/
  random.ts          seeded RNG (e.g. mulberry32) + pick/range helpers
  builders.ts        thinking(), toolCall(), toolResult(), subagent() …
  scenarios/         one file per scenario: steps + answer key
  writers/
    normalised.ts    → samples/<name>.run.json
    claude-code.ts   → samples/<name>.claude-code.jsonl
    otel.ts          → samples/<name>.otel.json
  index.ts           runs every scenario through every writer
samples/             generated output, committed so the demo works offline
```

**How a scenario reads**

Write each scenario as a short sequence using the builders, and let the builders fill in IDs, timings and tokens:

```ts
export default scenario("silent-bad-result", { seed: 3 }, (s) => {
  s.user("Add a due-date filter to the to-do app and make the tests pass");
  s.think();
  const search = s.tool("search", { query: "filter" }, { returns: "src/legacy/filter.ts" });
  s.think();
  s.tool("edit_file", { path: "src/legacy/filter.ts" }, { causedBy: [search] });
  // … more steps …
  const tests = s.tool("run_tests", {}, { status: "error", durationMs: 34_000 });
  s.answerKey({ failure: tests, cause: search });
});
```

You can ask Claude Code to write the builders and writers for you from this guide. That's AI-assisted development; the app itself still makes no AI calls.

## Step 5: Write source-format files

Copy the real structure from real files; don't write formats from memory or from this guide.

**Claude Code JSONL**

1. Run Claude Code on a throwaway side project (e.g. the to-do app), including one task that fails and one that uses a sub-agent.
2. Open the session file in `~/.claude/projects/<project>/`. Note the line types, where tool calls, results and token usage sit, and whether lines carry timestamps.
3. Save a trimmed copy as `fixtures/claude-code-reference.jsonl`, with any personal paths or content replaced.
4. Write `writers/claude-code.ts` to produce lines in that same shape from your scenarios.
5. Diff a generated file against the reference: same keys, same nesting.

**OpenTelemetry GenAI**

1. Read the [agent spans spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans) for operation names (`invoke_agent`, `execute_tool`) and attribute names.
2. Write each step as a span with a trace ID, span ID, parent span ID, start and end time, and attributes.
3. Use OTLP's JSON export shape, and record the spec version you followed in the file, since the conventions are still changing.

**Public trajectories**

Download a small sample (e.g. 20 runs) from an open dataset into `fixtures/public/` with its licence and attribution. Use them to check your adapters cope with data you didn't design.

## Step 6: Check the data

Run automatic checks every time you generate, so a bad sample never reaches a demo or a test session.

**Checks (a zod schema plus a few rules)**

- Every `parentId` and `causedBy` points at a step that exists, and no step is its own ancestor.
- `end` ≥ `start`, and every child sits inside its parent's time span.
- Input tokens never decrease between model calls in the same agent.
- Each scenario's answer key points at real step IDs, and the planted problem is actually present (e.g. scenario 4 has 8 identical calls).
- Each source-format file, run through your own adapter, gives back the same normalised run. This round-trip check is your adapter test suite.

**Never put in the data**

- Anything from WeaveForge or from work sessions: code, names, paths, hostnames.
- Real personal details, API keys or tokens, even fake-looking ones copied from somewhere.
- Copyrighted text pasted into tool outputs; generate filler code and logs instead.

**Done when:** all 10 scenarios generate in all three formats, pass the checks, and scenario 8 opens in the viewer without lag.
