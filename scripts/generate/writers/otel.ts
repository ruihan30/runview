import type { Run, Step } from "../../../src/model/run";
import { createRng } from "../random";

/**
 * → samples/<name>.otel.json, in OTLP's JSON export shape.
 *
 * Span and attribute names follow the OpenTelemetry GenAI agent-span conventions:
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans
 * Those conventions are still changing. Check this file against the spec page, then update
 * SEMCONV_VERSION to the version you followed. It is written into every file.
 *
 * Fields with no GenAI equivalent (step type, input/output, causedBy) go in `runview.*`
 * attributes, so the adapter can rebuild the exact run for the round-trip check.
 */
export const SEMCONV_VERSION = "1.37.0"; // TODO: confirm against the spec before relying on it

const RUN_START_MS = Date.UTC(2026, 0, 15, 9, 0, 0);
const MODEL = "synthetic-model";
const AGENT = "todo-agent";

const SPAN_KIND_INTERNAL = 1;
const SPAN_KIND_CLIENT = 3;
const STATUS_UNSET = 0;
const STATUS_OK = 1;
const STATUS_ERROR = 2;

type AnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { boolValue: boolean }
  | { arrayValue: { values: AnyValue[] } };

interface KeyValue {
  key: string;
  value: AnyValue;
}

function attr(key: string, value: string | number | boolean | string[]): KeyValue {
  if (Array.isArray(value)) return { key, value: { arrayValue: { values: value.map((v) => ({ stringValue: v })) } } };
  if (typeof value === "number") return { key, value: { intValue: String(Math.round(value)) } };
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  return { key, value: { stringValue: value } };
}

const nanos = (ms: number): string => (BigInt(RUN_START_MS + ms) * 1_000_000n).toString();
const asText = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

/** Returns null for untimed runs: OTel spans always carry timestamps. */
export function writeOtel(run: Run, seed: number): string | null {
  if (run.steps.some((step) => step.start === undefined || step.end === undefined)) return null;

  const rng = createRng(seed ^ 0x5eed);
  const traceId = rng.hex(32);
  const rootSpanId = rng.hex(16);
  const spanIds = new Map(run.steps.map((step) => [step.id, rng.hex(16)]));
  const runEnd = Math.max(0, ...run.steps.map((step) => step.end ?? 0));

  const root = {
    traceId,
    spanId: rootSpanId,
    name: `invoke_agent ${AGENT}`,
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: nanos(0),
    endTimeUnixNano: nanos(runEnd),
    attributes: [
      attr("gen_ai.operation.name", "invoke_agent"),
      attr("gen_ai.agent.name", AGENT),
      attr("runview.run.id", run.id),
      attr("runview.run.task", run.task),
      attr("runview.run.outcome", run.outcome),
    ],
    status: { code: run.outcome === "failure" ? STATUS_ERROR : STATUS_UNSET },
  };

  const spans = [root, ...run.steps.map((step) => toSpan(step))];

  function toSpan(step: Step) {
    const attributes: KeyValue[] = [
      attr("runview.step.id", step.id),
      attr("runview.step.type", step.type),
      attr("runview.step.name", step.name),
      attr("runview.step.status", step.status),
    ];
    let name: string;
    let kind = SPAN_KIND_INTERNAL;

    switch (step.type) {
      case "subagent":
        name = `invoke_agent ${step.name}`;
        attributes.push(attr("gen_ai.operation.name", "invoke_agent"), attr("gen_ai.agent.name", step.name));
        break;
      case "thinking":
      case "message":
      case "tool_call":
        name = `chat ${MODEL}`;
        kind = SPAN_KIND_CLIENT;
        attributes.push(attr("gen_ai.operation.name", "chat"), attr("gen_ai.request.model", MODEL));
        if (step.type === "tool_call") attributes.push(attr("gen_ai.tool.name", step.name));
        break;
      case "tool_result":
        name = `execute_tool ${step.name}`;
        attributes.push(attr("gen_ai.operation.name", "execute_tool"), attr("gen_ai.tool.name", step.name));
        if (step.causedBy?.[0]) attributes.push(attr("gen_ai.tool.call.id", step.causedBy[0]));
        break;
      case "user":
        name = "user_input";
        break;
    }

    if (step.tokens) {
      attributes.push(attr("gen_ai.usage.input_tokens", step.tokens.input), attr("gen_ai.usage.output_tokens", step.tokens.output));
    }
    if (step.input !== undefined) attributes.push(attr("runview.step.input", asText(step.input)));
    if (step.output !== undefined) attributes.push(attr("runview.step.output", asText(step.output)));
    if (step.causedBy?.length) attributes.push(attr("runview.step.caused_by", step.causedBy));

    return {
      traceId,
      spanId: spanIds.get(step.id)!,
      parentSpanId: step.parentId ? spanIds.get(step.parentId)! : rootSpanId,
      name,
      kind,
      startTimeUnixNano: nanos(step.start!),
      endTimeUnixNano: nanos(step.end!),
      attributes,
      status:
        step.status === "error"
          ? { code: STATUS_ERROR, message: step.error?.message ?? "" }
          : { code: step.status === "ok" ? STATUS_OK : STATUS_UNSET },
    };
  }

  const otlp = {
    resourceSpans: [
      {
        resource: {
          attributes: [attr("service.name", "runview-synthetic"), attr("runview.semconv_version", SEMCONV_VERSION)],
        },
        scopeSpans: [
          {
            scope: { name: "runview-generator", version: "0.1.0" },
            schemaUrl: `https://opentelemetry.io/schemas/${SEMCONV_VERSION}`,
            spans,
          },
        ],
      },
    ],
  };
  return JSON.stringify(otlp, null, 2) + "\n";
}
