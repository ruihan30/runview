import { scenario } from "../builders";
import { silentBadResult, silentBadResultOptions } from "./03-silent-bad-result";

// Scenario 3 with timestamps removed. Same seed, so the step ids and answer key match.
export default scenario(
  "untimed",
  {
    ...silentBadResultOptions,
    untimed: true,
    description: "Scenario 3 (silent bad result) with no timestamps, as some trajectory formats have.",
  },
  silentBadResult,
);
