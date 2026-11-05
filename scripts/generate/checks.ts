// Automatic checks, run on every `npm run gen`, so a bad sample never reaches a demo or test session.

import type { Step } from "../../src/model/run";
import { RunSchema } from "../../src/model/schema";
import type { Scenario } from "./builders";

export function checkScenario(s: Scenario): string[] {
  const parsed = RunSchema.safeParse(s.run);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `schema: ${issue.path.join(".")}: ${issue.message}`);
  }

  const problems: string[] = [];
  const { steps } = s.run;
  const byId = new Map<string, Step>();
  for (const step of steps) {
    if (byId.has(step.id)) problems.push(`duplicate step id ${step.id}`);
    byId.set(step.id, step);
  }

  // Every parentId and causedBy points at a step that exists; no step is its own ancestor.
  for (const step of steps) {
    if (step.parentId !== null) {
      const parent = byId.get(step.parentId);
      if (!parent) problems.push(`${step.id}: parentId ${step.parentId} doesn't exist`);
      else if (parent.type !== "subagent") problems.push(`${step.id}: parent ${parent.id} isn't a subagent step`);
    }
    for (const id of step.causedBy ?? []) {
      if (!byId.has(id)) problems.push(`${step.id}: causedBy ${id} doesn't exist`);
    }
    const seen = new Set([step.id]);
    for (let cur = step.parentId; cur !== null; cur = byId.get(cur)?.parentId ?? null) {
      if (seen.has(cur)) {
        problems.push(`${step.id}: is its own ancestor`);
        break;
      }
      seen.add(cur);
    }
  }

  // Timing: end ≥ start, ordered by start, children inside their parent's span.
  if (s.untimed) {
    if (steps.some((step) => step.start !== undefined || step.end !== undefined)) {
      problems.push("untimed scenario has timestamps");
    }
  } else {
    let previousStart = -Infinity;
    for (const step of steps) {
      if (step.start === undefined || step.end === undefined) {
        problems.push(`${step.id}: missing start or end`);
        continue;
      }
      if (step.end < step.start) problems.push(`${step.id}: ends before it starts`);
      if (step.start < previousStart) problems.push(`${step.id}: steps aren't ordered by start`);
      previousStart = step.start;
      const parent = step.parentId ? byId.get(step.parentId) : undefined;
      if (parent?.start !== undefined && parent.end !== undefined && (step.start < parent.start || step.end > parent.end)) {
        problems.push(`${step.id}: sits outside its parent's time span`);
      }
    }
  }

  // Input tokens never decrease between model calls in the same agent.
  const lastInput = new Map<string | null, number>();
  for (const step of steps) {
    if (!step.tokens) continue;
    const previous = lastInput.get(step.parentId);
    if (previous !== undefined && step.tokens.input < previous) {
      problems.push(`${step.id}: input tokens dropped from ${previous} to ${step.tokens.input}`);
    }
    lastInput.set(step.parentId, step.tokens.input);
  }

  // The answer key points at real steps, and the planted problem is really there.
  for (const [field, id] of Object.entries({ failure: s.answerKey.failure, cause: s.answerKey.cause })) {
    if (id !== undefined && !byId.has(id)) problems.push(`answer key ${field} ${id} doesn't exist`);
  }
  problems.push(...(s.verify?.(s.run, s.answerKey) ?? []));

  // TODO round trip: once the adapters exist, parse each written source file with its adapter
  // and check the result equals s.run. That check is the adapter test suite.

  return problems;
}
