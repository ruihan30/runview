import type { Run } from "../../../src/model/run";

/**
 * → samples/<name>.claude-code.jsonl
 *
 * NOT WRITTEN YET, on purpose. Step 5 of mock-data-guide.md says to copy the shape from a real
 * session file, not from memory:
 *
 *   1. Run Claude Code on a throwaway side project, including one task that fails and one that
 *      uses a sub-agent.
 *   2. Open the session file in ~/.claude/projects/<project>/ and note the line types, where tool
 *      calls, results and token usage sit, and whether lines carry timestamps.
 *   3. Save a trimmed copy as fixtures/claude-code-reference.jsonl, with personal paths and
 *      content replaced.
 *   4. Implement this function to produce lines in that same shape.
 *   5. Diff a generated file against the reference: same keys, same nesting.
 *
 * Returning null makes index.ts skip this format.
 */
export function writeClaudeCode(_run: Run): string | null {
  return null;
}
