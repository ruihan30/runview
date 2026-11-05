import type { Run } from "../../../src/model/run";

/** → samples/<name>.run.json */
export function writeNormalised(run: Run): string {
  return JSON.stringify(run, null, 2) + "\n";
}
