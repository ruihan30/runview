// The normalised run model. Every adapter turns its source format into this,
// and every view reads only this.

export type StepType =
  | "user" // the task or a user message
  | "thinking" // model reasoning
  | "message" // model text reply
  | "tool_call" // e.g. read_file, run_command
  | "tool_result"
  | "subagent"; // a container for a nested run

export type StepStatus = "ok" | "error" | "cancelled";

export interface Step {
  id: string;
  parentId: string | null; // sub-agent steps point at their subagent step
  type: StepType;
  name: string; // tool name, or a short label
  start?: number; // ms since run start; optional for untimed runs
  end?: number;
  status: StepStatus;
  tokens?: { input: number; output: number };
  input?: unknown; // tool arguments, prompt text
  output?: unknown; // tool result, reply text
  error?: { message: string };
  causedBy?: string[]; // step ids whose output this step used
}

export type RunSource = "claude-code" | "otel" | "trajectory" | "synthetic";
export type RunOutcome = "success" | "failure" | "unknown";

export interface Run {
  id: string;
  source: RunSource;
  task: string;
  outcome: RunOutcome;
  steps: Step[]; // flat list, ordered by start (or by position if untimed)
}
