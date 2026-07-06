// AUTHORED-BY Claude Fable 5
//
// The companion parse is the suite's requirement index — these tests pin it
// against the committed TTLs so a companion re-extraction that changes shape
// is caught here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCompanions } from '../lib/companion.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { statements, meta } = loadCompanions(repoRoot);

test('loads every statement from both companions', () => {
  assert.equal(statements.length, 242);
  assert.equal(statements.filter((s) => s.spec === 'core').length, 195);
  assert.equal(statements.filter((s) => s.spec === 'rdf-transform').length, 47);
});

test('testability spine and levels are fully mapped (no raw IRIs leak)', () => {
  for (const s of statements) {
    assert.ok(['E', 'A-int', 'A-exist', 'P'].includes(s.testability), `${s.id}: testability ${s.testability}`);
    assert.ok(['MUST', 'MUST NOT', 'SHOULD', 'SHOULD NOT', 'MAY'].includes(s.level), `${s.id}: level ${s.level}`);
    assert.ok(s.subjects.length > 0, `${s.id}: no requirementSubject`);
    assert.ok(s.anchor, `${s.id}: no anchor`);
  }
});

test('a known statement parses field-by-field', () => {
  const s = statements.find((x) => x.id === 'JLWSC-CTN-1');
  assert.ok(s);
  assert.equal(s.level, 'MUST');
  assert.equal(s.testability, 'E');
  assert.deepEqual(s.subjects, ['Server']);
  assert.deepEqual(s.testCases, ['containers/rel-up-on-non-root']);
  assert.match(s.statement, /rel="up"/);
});

test('every enforceable statement has vectors, an external suite, or an explicit test gap', () => {
  for (const s of statements.filter((x) => x.testability === 'E')) {
    assert.ok(
      s.testCases.length > 0 || s.externalTestCases.length > 0 || s.testGap,
      `${s.id}: enforceable but no spec:testCase, external suite, or sc:testGap`,
    );
  }
});

test('external-suite references are preserved, not dropped (JLWSC-DLG-2)', () => {
  const s = statements.find((x) => x.id === 'JLWSC-DLG-2');
  assert.deepEqual(s.testCases, []);
  assert.equal(s.externalTestCases.length, 1);
  assert.match(s.externalTestCases[0], /agentic-solid-conformance/);
});

test('audit-class and premature statements never carry vectors', () => {
  for (const s of statements.filter((x) => x.testability !== 'E')) {
    assert.equal(s.testCases.length, 0, `${s.id} (${s.testability}) carries a vector`);
  }
});

test('companion pins record the spec commit', () => {
  assert.match(meta.core.specVersion, /^[0-9a-f]{40}$/);
  assert.equal(meta.core.specVersion, meta['rdf-transform'].specVersion);
});
