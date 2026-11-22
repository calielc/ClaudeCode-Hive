/**
 * The variables that mark a process as the child of one Claude Code session. A `claude` that inherits them thinks
 * it is a nested helper session, and it does not save its transcript. A Hive that you start from inside a Claude
 * Code session passes them on, so Hive removes them before it starts a terminal.
 * Settings that you choose on purpose stay: `CLAUDE_CONFIG_DIR`, the provider and the token variables.
 */
const SESSION_MARKERS =
  /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_CODE_(ENTRYPOINT|EXECPATH|SESSION_.*|CHILD_.*|BRIDGE_.*|MESSAGING_.*))$/;

export function withoutSessionMarkers(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !SESSION_MARKERS.test(name)) {
      clean[name] = value;
    }
  }
  return clean;
}
