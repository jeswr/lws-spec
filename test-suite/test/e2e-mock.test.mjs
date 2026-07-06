// AUTHORED-BY Claude Fable 5
//
// End-to-end self-test: the full runner pipeline (companions -> vectors ->
// plan -> execute -> aggregate) against the in-process mock.
//
//   - strict mock  = positive control: the runner must be able to report PASS
//     on a conforming surface (a runner that fails everything is useless);
//   - lenient mock = negative control: the runner must DETECT legacy-LDP
//     behaviour as failures (a runner that passes everything is dangerous).
//
// The vectors themselves are never touched — only the mock may be adjusted
// to satisfy them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockJlws } from './helpers/mock-jlws.mjs';
import { runSuite } from '../lib/runner.mjs';
import { loadConfig } from '../lib/config.mjs';
import { renderMarkdown } from '../lib/report.mjs';
import { ExchangeRunner } from '../lib/exchange.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The strict mock implements exactly this subset of the core protocol; the
// self-test requires every one of these vectors to PASS against it.
const STRICT_MUST_PASS = [
  'resources/put-create-if-none-match',
  'resources/put-create-existing-412',
  'resources/put-unconditional-existing-428',
  'resources/put-unconditional-nonexistent-428',
  'resources/put-create-missing-parent-409',
  'resources/byte-exact-roundtrip',
  'resources/head-mirrors-get',
  'resources/conditional-get-if-none-match-304',
  'resources/range-request-206',
  'resources/range-unsatisfiable-416',
  'resources/required-links-on-get',
  'resources/path-traversal-rejected',
  'resources/error-carries-problem-details',
  'containers/rel-up-on-non-root',
  'containers/post-create-data-resource',
  'containers/post-to-missing-container-404',
  'containers/listing-shape',
  'discovery/storage-description-link-on-get',
];

const LENIENT_MUST_FAIL = [
  'resources/put-unconditional-existing-428',
  'resources/put-unconditional-nonexistent-428',
  'resources/put-create-missing-parent-409',
  'resources/error-carries-problem-details',
  'resources/required-links-on-get',
];

test('strict mock: selected vectors pass end-to-end', async () => {
  const mock = createMockJlws();
  const target = await mock.start();
  try {
    const config = loadConfig({ overrides: { target, label: 'strict mock' } });
    const wanted = new Set(STRICT_MUST_PASS);
    const report = await runSuite(repoRoot, config, { caseFilter: (id) => wanted.has(id) });
    for (const id of STRICT_MUST_PASS) {
      const r = report.cases[id];
      assert.ok(r, `${id} missing from report`);
      assert.equal(r.disposition, 'pass', `${id}: ${JSON.stringify(r.failures ?? r.detail)}`);
    }
    // Statement-level: the wired statements must aggregate to pass.
    const ctn1 = report.statements.find((s) => s.id === 'JLWSC-CTN-1');
    assert.equal(ctn1.category, 'pass');
  } finally {
    await mock.stop();
  }
});

test('lenient (legacy-LDP) mock: non-conformance is detected, never masked', async () => {
  const mock = createMockJlws({ lenient: true });
  const target = await mock.start();
  try {
    const config = loadConfig({ overrides: { target, label: 'lenient mock' } });
    const wanted = new Set(LENIENT_MUST_FAIL);
    const report = await runSuite(repoRoot, config, { caseFilter: (id) => wanted.has(id) });
    for (const id of LENIENT_MUST_FAIL) {
      const r = report.cases[id];
      assert.equal(r.disposition, 'fail', `${id} should FAIL on the lenient mock, got ${r.disposition}`);
      assert.ok(r.failures.length > 0, `${id}: failures must carry detail`);
    }
    const cd1 = report.statements.find((s) => s.id === 'JLWSC-CW-1' || s.testCases.includes('resources/put-unconditional-existing-428'));
    assert.equal(cd1.category, 'fail');
  } finally {
    await mock.stop();
  }
});

const hijackCase = {
  id: 'synthetic/hijacked-location-mutation',
  operation: 'http-exchange',
  input: {
    state: {
      storageRoot: 'https://storage.example/alice/',
      resources: { 'https://storage.example/alice/': { type: 'Container' } },
    },
  },
  exchanges: [
    {
      request: { method: 'POST', target: 'https://storage.example/alice/', headers: { Slug: 'x', 'Content-Type': 'text/plain' }, body: 'x' },
      expected: { status: 201 },
    },
    {
      // A mutation steered by the hijacked Location must be refused.
      request: { method: 'DELETE', target: '${response[0].header.Location}' },
      expected: { status: 204 },
    },
  ],
};

for (const [name, hijackLocation, runId] of [
  ['plain out-of-scope path', true, 'jlws-guardtest'],
  // startsWith(runScope) would pass this one — only URL normalisation
  // reveals the escape (dot segments collapse to /pwned).
  ['dot-segment escape', '/jlws-guardtest2/../pwned', 'jlws-guardtest2'],
]) {
  test(`scope guard: server-minted mutation target refused (${name})`, async () => {
    const mock = createMockJlws({ hijackLocation });
    const target = await mock.start();
    try {
      const config = loadConfig({ overrides: { target, label: 'hijack mock' } });
      const runner = new ExchangeRunner(config, runId);
      const result = await runner.runCase(hijackCase);
      assert.equal(result.disposition, 'fail');
      assert.ok(result.failures.some((f) => f.includes('escapes the run scope')), JSON.stringify(result.failures));
      assert.ok(
        !mock.requests.some((r) => r.startsWith('DELETE') && r.includes('pwned')),
        `the hijacked DELETE must never be sent (saw: ${mock.requests.filter((r) => r.startsWith('DELETE')).join(', ')})`,
      );
    } finally {
      await mock.stop();
    }
  });
}

test('partial runs: filtered-out vectors classify as untested-filtered, never as something else', async () => {
  const mock = createMockJlws();
  const target = await mock.start();
  try {
    const config = loadConfig({ overrides: { target, label: 'filter mock' } });
    const report = await runSuite(repoRoot, config, { caseFilter: (id) => id === 'resources/put-create-if-none-match' });
    // JLWSC-CTN-1 is wired to containers/rel-up-on-non-root, which the filter excluded.
    const ctn1 = report.statements.find((s) => s.id === 'JLWSC-CTN-1');
    assert.equal(ctn1.category, 'untested-filtered');
    assert.ok(report.summary.statements.byCategory['untested-filtered'] > 0);
  } finally {
    await mock.stop();
  }
});

test('report: skip taxonomy is honest and the scoreboard renders', async () => {
  const mock = createMockJlws();
  const target = await mock.start();
  try {
    const config = loadConfig({ overrides: { target, label: 'taxonomy check' } });
    const only = new Set([
      'resources/put-create-if-none-match', // runs
      'resources/quota-exhaustion-507', // precondition: storage-quota
      'resources/conditional-get-if-modified-since-304', // literal If-Modified-Since
      'resources/agent-authenticated-via-bob', // agent seam missing
      'auth/token-valid-accepted', // library-level operation
      'auth/challenge-401-shape', // state.trustedIssuers unrealizable
    ]);
    const report = await runSuite(repoRoot, config, { caseFilter: (id) => only.has(id) });
    assert.equal(report.cases['resources/put-create-if-none-match'].disposition, 'pass');
    assert.equal(report.cases['resources/quota-exhaustion-507'].disposition, 'skip-precondition');
    assert.equal(report.cases['resources/conditional-get-if-modified-since-304'].disposition, 'skip-unrealizable-state');
    assert.equal(report.cases['resources/agent-authenticated-via-bob'].disposition, 'skip-unrealizable-state');
    assert.equal(report.cases['auth/token-valid-accepted'].disposition, 'skip-library-vector');
    assert.equal(report.cases['auth/challenge-401-shape'].disposition, 'skip-unrealizable-state');

    // Statement categories reflect the testability spine: every SERVER-SIDE
    // audit-class/P statement lands in its class; non-server subjects go to
    // not-applicable first (a server harness cannot hold a client to account).
    const byCat = report.summary.statements.byCategory;
    assert.equal(report.summary.statements.total, 242);
    const serverSide = (t) =>
      report.statements.filter((s) => s.testability === t && s.category !== 'not-applicable').length;
    assert.equal(byCat['audit-evidence'], serverSide('A-exist') + serverSide('A-int'));
    assert.equal(byCat.premature, serverSide('P'));
    assert.ok(byCat['audit-evidence'] > 0);
    assert.ok(byCat.premature > 0);
    assert.ok(byCat['not-applicable'] > 0);
    assert.equal(byCat['external-suite'], 1); // JLWSC-DLG-2 -> agentic-solid-conformance

    const markdown = renderMarkdown(report, { baselineNote: 'note' });
    for (const needle of [
      '# JLWS conformance report',
      '## Headline — executed statements',
      'evidence-check (audit-class A-int/A-exist)',
      'Case annex',
      'JLWSC-',
    ]) {
      assert.ok(markdown.includes(needle), `markdown missing ${needle}`);
    }
  } finally {
    await mock.stop();
  }
});
