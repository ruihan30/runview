// Builders that turn a short scenario script into a realistic normalised run.
// Scenarios say *what* happens; the builders fill in IDs, timings, tokens and causedBy.

import type { Run, RunOutcome, Step, StepStatus, StepType } from "../../src/model/run";
import { createRng, type Rng } from "./random";
import * as text from "./text";

// ---------------------------------------------------------------- public types

export interface AnswerKey {
  /** The step where the problem shows up (e.g. the failing test run). */
  failure?: string;
  /** The step that caused it (e.g. the search that returned the wrong file). */
  cause?: string;
  note: string;
}

export interface Scenario {
  name: string;
  description: string;
  seed: number;
  untimed: boolean;
  /** The writers' output gets damaged on purpose (scenario 10). */
  corrupt: boolean;
  run: Run;
  answerKey: AnswerKey;
  /** Scenario-specific checks that the planted problem is really there. Returns problems found. */
  verify?: (run: Run, key: AnswerKey) => string[];
}

export interface ScenarioOptions {
  seed: number;
  description: string;
  outcome: RunOutcome;
  untimed?: boolean;
  corrupt?: boolean;
  verify?: Scenario["verify"];
}

export interface ToolOptions {
  /** Tool output text. Defaults to something plausible for the tool. */
  returns?: string;
  status?: StepStatus;
  /** Error message. Defaults to a realistic one for the tool. */
  error?: string;
  /** How long the tool itself ran. Defaults to a range typical for the tool. */
  durationMs?: number;
  /** Tokens the result adds to the conversation. Defaults to the output's size. */
  resultTokens?: number;
  /** Step ids whose output this call used. */
  causedBy?: string[];
}

export interface SubagentSpec {
  name: string;
  task: string;
  /** What the sub-agent reports back to the parent. */
  summary: string;
  status?: StepStatus;
  error?: string;
  body: (agent: Agent) => void;
}

// ---------------------------------------------------------------- tool profiles

interface ToolProfile {
  minMs: number;
  maxMs: number;
  output(input: Record<string, unknown>, ok: boolean, rng: Rng): string | undefined;
  error(input: Record<string, unknown>): string;
}

const str = (value: unknown): string => String(value ?? "");

const TOOLS: Record<string, ToolProfile> = {
  read_file: {
    minMs: 15,
    maxMs: 250,
    output: (i, ok, rng) => (ok ? text.fileContents(str(i.path), rng) : undefined),
    error: (i) => `ENOENT: no such file or directory, open '${text.ROOT}/${str(i.path)}'`,
  },
  list_files: {
    minMs: 10,
    maxMs: 120,
    output: (i, ok) => (ok ? text.listing(str(i.path)) : undefined),
    error: (i) => `ENOENT: no such file or directory, scandir '${text.ROOT}/${str(i.path)}'`,
  },
  search: {
    minMs: 80,
    maxMs: 900,
    output: (i, ok, rng) => (ok ? text.searchResults(str(i.query), rng) : undefined),
    error: (i) => `rg: regex parse error: ${str(i.query)}`,
  },
  edit_file: {
    minMs: 20,
    maxMs: 150,
    output: (i, ok, rng) => (ok ? `Applied 1 edit to ${str(i.path)} (+${rng.int(1, 24)} −${rng.int(0, 12)})` : undefined),
    error: (i) => `Edit failed: old_string not found in ${str(i.path)}`,
  },
  write_file: {
    minMs: 20,
    maxMs: 120,
    output: (i, ok, rng) => (ok ? `Wrote ${rng.int(20, 140)} lines to ${str(i.path)}` : undefined),
    error: (i) => `EACCES: permission denied, open '${text.ROOT}/${str(i.path)}'`,
  },
  run_tests: {
    minMs: 8_000,
    maxMs: 40_000,
    output: (_i, ok, rng) => text.testLog(ok, rng),
    error: () => "Process exited with code 1",
  },
  run_command: {
    minMs: 500,
    maxMs: 12_000,
    output: (i, ok, rng) => text.commandOutput(str(i.command), ok, rng),
    error: (i) => `Command failed with exit code 1: ${str(i.command)}`,
  },
};

const DEFAULT_TOOL: ToolProfile = {
  minMs: 50,
  maxMs: 2_000,
  output: (_i, ok) => (ok ? "done" : undefined),
  error: () => "Tool failed",
};

/** Tokens already in context when a run starts: system prompt plus tool definitions. */
const SYSTEM_PROMPT_TOKENS = 3_200;
const SUBAGENT_PROMPT_TOKENS = 1_500;

// ---------------------------------------------------------------- builders

class RunState {
  readonly steps: Step[] = [];
  private count = 0;
  constructor(readonly rng: Rng) {}
  nextId(): string {
    return `s${String(++this.count).padStart(4, "0")}`;
  }
}

/** One agent's timeline. Sub-agents get their own Agent with its own clock and context. */
export class Agent {
  protected context: number;

  constructor(
    protected readonly state: RunState,
    readonly parentId: string | null,
    public clock: number,
    context: number,
  ) {
    this.context = context;
  }

  get rng(): Rng {
    return this.state.rng;
  }

  /** The task or a user message. */
  user(message: string): string {
    this.idle();
    const step = this.push({ type: "user", name: "user", start: this.clock, end: this.clock, status: "ok", input: message });
    this.context += text.approxTokens(message);
    return step.id;
  }

  /** Model reasoning. Leave `note` out for filler text. */
  think(note?: string, opts: { causedBy?: string[] } = {}): string {
    const out = note ?? text.thought(this.rng);
    // Output tokens stay small and spiky.
    const extra = this.rng.int(20, this.rng.chance(0.15) ? 1_200 : 300);
    return this.model("thinking", "thinking", 1_500, 9_000, text.approxTokens(out) + extra, { output: out, causedBy: opts.causedBy }).id;
  }

  /** Model text reply. */
  message(reply: string, opts: { causedBy?: string[] } = {}): string {
    return this.model("message", "reply", 800, 4_000, text.approxTokens(reply) + this.rng.int(5, 40), { output: reply, causedBy: opts.causedBy }).id;
  }

  /** A tool call and its result. Returns the result's id, since that's the step later steps use. */
  tool(name: string, input: Record<string, unknown> = {}, opts: ToolOptions = {}): string {
    const call = this.model("tool_call", name, 300, 1_500, this.rng.int(20, 150), { input, causedBy: opts.causedBy });

    const profile = TOOLS[name] ?? DEFAULT_TOOL;
    const status = opts.status ?? "ok";
    const ok = status === "ok";
    this.clock += Math.round(this.rng.range(5, 60));
    const start = this.clock;
    const end = start + (opts.durationMs ?? this.duration(profile.minMs, profile.maxMs));
    const output = opts.returns ?? profile.output(input, ok, this.rng);
    const error = ok ? undefined : { message: opts.error ?? profile.error(input) };

    const result = this.push({ type: "tool_result", name, start, end, status, output, error, causedBy: [call.id] });
    this.context += opts.resultTokens ?? text.approxTokens(output ?? error?.message);
    this.clock = end;
    return result.id;
  }

  /** Filler: `rounds` cycles of think → read/search/list. Three steps per round. */
  explore(rounds: number): void {
    for (let i = 0; i < rounds; i++) {
      this.think();
      const kind = this.rng.pick(["read_file", "read_file", "search", "list_files"] as const);
      if (kind === "read_file") this.tool("read_file", { path: this.rng.pick(text.FILES) });
      else if (kind === "search") this.tool("search", { query: this.rng.pick(text.QUERIES) });
      else this.tool("list_files", { path: this.rng.pick(["src", "src/filters", "src/components", "tests"]) });
    }
  }

  /** Sub-agents that run in parallel. Returns the subagent step ids, in the order given. */
  parallel(specs: SubagentSpec[]): string[] {
    this.idle();
    const start = this.clock;
    let latest = start;
    const ids: string[] = [];

    for (const spec of specs) {
      const sub = this.push({ type: "subagent", name: spec.name, start, end: start, status: "ok", input: spec.task });
      const child = new Agent(this.state, sub.id, start + Math.round(this.rng.range(20, 600)), SUBAGENT_PROMPT_TOKENS);
      child.user(spec.task);
      spec.body(child);

      sub.end = child.clock;
      sub.status = spec.status ?? "ok";
      sub.output = spec.summary;
      if (sub.status !== "ok") sub.error = { message: spec.error ?? "Sub-agent stopped before finishing its task" };

      latest = Math.max(latest, child.clock);
      this.context += text.approxTokens(spec.summary);
      ids.push(sub.id);
    }

    this.clock = latest;
    return ids;
  }

  /** Remove a field from a step, to simulate gaps in real data. */
  omit(stepId: string, field: "tokens" | "output"): void {
    const step = this.state.steps.find((s) => s.id === stepId);
    if (step) delete step[field];
  }

  // -------------------------------------------------------------- internals

  protected push(fields: Omit<Step, "id" | "parentId">): Step {
    const step: Step = { id: this.state.nextId(), parentId: this.parentId, ...fields };
    // Drop undefined keys so the JSON stays clean.
    for (const key of Object.keys(step) as Array<keyof Step>) if (step[key] === undefined) delete step[key];
    this.state.steps.push(step);
    return step;
  }

  /** Small idle gap before a step, with the odd longer pause. */
  private idle(): void {
    this.clock += Math.round(this.rng.chance(0.05) ? this.rng.range(1_500, 8_000) : this.rng.range(20, 400));
  }

  /** A duration from a range, with rare outliers. */
  private duration(minMs: number, maxMs: number): number {
    let d = this.rng.range(minMs, maxMs);
    if (this.rng.chance(0.03)) d *= this.rng.range(3, 8);
    return Math.round(d);
  }

  /** A model call. Input tokens are the whole conversation so far, so they rise through the run. */
  private model(type: StepType, name: string, minMs: number, maxMs: number, outputTokens: number, fields: Partial<Step>): Step {
    this.idle();
    const start = this.clock;
    const end = start + this.duration(minMs, maxMs);
    const step = this.push({ type, name, start, end, status: "ok", tokens: { input: this.context, output: outputTokens }, ...fields });
    this.context += outputTokens;
    this.clock = end;
    return step;
  }
}

export class ScenarioBuilder extends Agent {
  key: AnswerKey | undefined;

  answerKey(key: AnswerKey): void {
    this.key = key;
  }
}

export function scenario(name: string, options: ScenarioOptions, body: (s: ScenarioBuilder) => void): Scenario {
  const state = new RunState(createRng(options.seed));
  const s = new ScenarioBuilder(state, null, 0, SYSTEM_PROMPT_TOKENS);
  body(s);

  // Flat list ordered by start. The sort is stable, so ties keep creation order.
  const steps = [...state.steps].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  if (options.untimed) {
    for (const step of steps) {
      delete step.start;
      delete step.end;
    }
  }

  const task = steps.find((step) => step.type === "user" && step.parentId === null)?.input;

  return {
    name,
    description: options.description,
    seed: options.seed,
    untimed: options.untimed ?? false,
    corrupt: options.corrupt ?? false,
    verify: options.verify,
    answerKey: s.key ?? { note: "No planted problem." },
    run: { id: name, source: "synthetic", task: str(task), outcome: options.outcome, steps },
  };
}
