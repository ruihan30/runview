// Damages a written file on purpose, for scenario 10.
// Breaks one line in the middle (an unquoted key) and cuts the end off mid-line.

export interface Corruption {
  /** 1-based line number of the invalid JSON. */
  invalidLine: number;
  /** The file is cut short; the last line is incomplete. */
  truncated: true;
}

export function corrupt(content: string): { text: string; info: Corruption } {
  const lines = content.split("\n");
  let target = Math.floor(lines.length / 2);
  while (target < lines.length && !/"[^"]+":/.test(lines[target])) target++;
  if (target >= lines.length) throw new Error("corrupt(): no line with a JSON key to break");

  lines[target] = lines[target].replace(/"([^"]+)":/, "$1:");
  const broken = lines.join("\n");
  const cut = Math.floor(broken.length * 0.97);

  return { text: broken.slice(0, cut), info: { invalidLine: target + 1, truncated: true } };
}
