// AUTHORED-BY Claude Fable 5
//
// Target-config loading: the controllerBearer seam (the storage-controller
// credential a fail-closed target like solid-server-rs needs) — override
// plumbing (the --controller-bearer CLI flag lands as an override), default,
// and fail-closed validation of a malformed value.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../lib/config.mjs';

test('controllerBearer defaults to null (anonymous controller)', () => {
  const config = loadConfig({ overrides: { target: 'http://localhost:3000' } });
  assert.equal(config.controllerBearer, null);
});

test('controllerBearer override (the --controller-bearer flag) reaches the config', () => {
  const config = loadConfig({
    overrides: { target: 'http://localhost:3000', controllerBearer: 'tok-123' },
  });
  assert.equal(config.controllerBearer, 'tok-123');
});

test('a non-string / empty controllerBearer is refused, never silently anonymous', () => {
  for (const bad of ['', '   ', 42, {}, []]) {
    assert.throws(
      () => loadConfig({ overrides: { target: 'http://localhost:3000', controllerBearer: bad } }),
      /controllerBearer/,
    );
  }
});
