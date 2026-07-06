// AUTHORED-BY Claude Fable 5
//
// CLI flag parsing for bin/run.mjs, extracted so the fail-closed flag
// discipline is unit-testable.
//
// Value-taking flags are detected by PRESENCE, not value truthiness: a flag
// that is present but missing its value (end of argv, or the next token is
// another `--flag`) is a hard error — never a silent fall-back to the
// config-file / default path. This matters most for `--controller-bearer`:
// a mistyped `--controller-bearer ""` (or a swallowed value) must fail the
// run loudly rather than silently downgrade storage-controller requests to
// anonymous/config credentials. Values are passed through verbatim —
// `loadConfig` owns semantic validation (an empty/whitespace
// controllerBearer is rejected there).

/**
 * Presence-based lookup of a value-taking `--<name> <value>` flag.
 *
 * @param {string[]} args raw argv slice
 * @param {string} name flag name without the leading dashes
 * @returns {string | undefined} the value, or `undefined` when the flag is
 *   absent (so callers can distinguish "not given" from any given value)
 * @throws {Error} when the flag is present but its value is missing — i.e.
 *   it is the last token, or the next token is another `--flag`
 */
export function flagValue(args, name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(
      `--${name} requires a value (got ${value === undefined ? 'end of arguments' : `"${value}"`})`,
    );
  }
  return value;
}

/**
 * The config overrides carried by CLI flags, for `loadConfig`'s `overrides`.
 *
 * An absent flag contributes NO key at all (`undefined` never lands in the
 * object), so the config-file / default path is untouched. A present flag
 * always lands its value — including an empty string — so malformed values
 * reach `loadConfig`'s validation and are rejected loudly instead of being
 * truthiness-filtered into silence.
 *
 * @param {string[]} args raw argv slice
 * @returns {{ target?: string, label?: string, controllerBearer?: string }}
 */
export function cliConfigOverrides(args) {
  const overrides = {};
  for (const [flag, key] of [
    ['target', 'target'],
    ['label', 'label'],
    ['controller-bearer', 'controllerBearer'],
  ]) {
    const value = flagValue(args, flag);
    if (value !== undefined) overrides[key] = value;
  }
  return overrides;
}
