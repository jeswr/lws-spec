// AUTHORED-BY Claude Fable 5
//
// CLI flag discipline (lib/cli.mjs): --controller-bearer is PRESENCE-checked
// and fail-closed. A present flag with an empty or missing value must be a
// hard error — never a silent fall-back to anonymous/config credentials —
// while an absent flag must leave the config-file/default path untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliConfigOverrides, flagValue } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';

const TARGET = ['--target', 'http://localhost:3000'];

test('--controller-bearer present with an EMPTY value is a hard error, never silent anonymous', () => {
  // The empty value must land in the overrides (not be truthiness-filtered
  // out) so loadConfig's validation rejects it loudly.
  const overrides = cliConfigOverrides([...TARGET, '--controller-bearer', '']);
  assert.equal(overrides.controllerBearer, '');
  assert.throws(() => loadConfig({ overrides }), /controllerBearer/);
});

test('--controller-bearer present with a whitespace-only value is rejected by loadConfig', () => {
  const overrides = cliConfigOverrides([...TARGET, '--controller-bearer', '   ']);
  assert.throws(() => loadConfig({ overrides }), /controllerBearer/);
});

test('--controller-bearer as the LAST token (missing value) is a hard error', () => {
  assert.throws(
    () => cliConfigOverrides([...TARGET, '--controller-bearer']),
    /--controller-bearer requires a value/,
  );
});

test('--controller-bearer followed by another --flag (swallowed value) is a hard error', () => {
  assert.throws(
    () => cliConfigOverrides(['--controller-bearer', '--quiet', ...TARGET]),
    /--controller-bearer requires a value/,
  );
});

test('--controller-bearer with a valid token is used', () => {
  const overrides = cliConfigOverrides([...TARGET, '--controller-bearer', 'tok-abc.def']);
  const config = loadConfig({ overrides });
  assert.equal(config.controllerBearer, 'tok-abc.def');
});

test('flag ABSENT → no override key at all; default config path unchanged', () => {
  const overrides = cliConfigOverrides([...TARGET]);
  assert.equal('controllerBearer' in overrides, false);
  const config = loadConfig({ overrides });
  assert.equal(config.controllerBearer, null);
});

test('flag ABSENT → a config-file controllerBearer is NOT clobbered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jlws-cli-test-'));
  try {
    const configPath = join(dir, 'target.json');
    writeFileSync(
      configPath,
      JSON.stringify({ target: 'http://localhost:3000', controllerBearer: 'from-file' }),
    );
    const config = loadConfig({ configPath, overrides: cliConfigOverrides([]) });
    assert.equal(config.controllerBearer, 'from-file');
    // …and a present flag still overrides the file value.
    const overridden = loadConfig({
      configPath,
      overrides: cliConfigOverrides(['--controller-bearer', 'from-cli']),
    });
    assert.equal(overridden.controllerBearer, 'from-cli');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('flagValue: absent flag returns undefined; present flag returns its verbatim value', () => {
  assert.equal(flagValue(['--other', 'x'], 'controller-bearer'), undefined);
  assert.equal(flagValue(['--label', ''], 'label'), '');
  assert.equal(flagValue(['--only', 'core-'], 'only'), 'core-');
});
