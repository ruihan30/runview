import { z } from "zod";

// Runtime schema for the run model in ./run.ts. Keep the two in step.
// Used by the generator's checks now, and by the app to validate loaded files later.

export const StepSchema = z.strictObject({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  type: z.enum(["user", "thinking", "message", "tool_call", "tool_result", "subagent"]),
  name: z.string(),
  start: z.number().nonnegative().optional(),
  end: z.number().nonnegative().optional(),
  status: z.enum(["ok", "error", "cancelled"]),
  tokens: z
    .strictObject({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    })
    .optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.strictObject({ message: z.string() }).optional(),
  causedBy: z.array(z.string()).optional(),
});

export const RunSchema = z.strictObject({
  id: z.string().min(1),
  source: z.enum(["claude-code", "otel", "trajectory", "synthetic"]),
  task: z.string(),
  outcome: z.enum(["success", "failure", "unknown"]),
  steps: z.array(StepSchema),
});
