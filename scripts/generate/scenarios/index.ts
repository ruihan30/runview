import type { Scenario } from "../builders";
import happyPath from "./01-happy-path";
import errorRecovery from "./02-error-recovery";
import silentBadResult from "./03-silent-bad-result";
import loop from "./04-loop";
import slowStep from "./05-slow-step";
import subagents from "./06-subagents";
import tokenBlowup from "./07-token-blowup";
import largeRun from "./08-large-run";
import untimed from "./09-untimed";
import brokenFile from "./10-broken-file";

export const scenarios: Scenario[] = [
  happyPath,
  errorRecovery,
  silentBadResult,
  loop,
  slowStep,
  subagents,
  tokenBlowup,
  largeRun,
  untimed,
  brokenFile,
];
