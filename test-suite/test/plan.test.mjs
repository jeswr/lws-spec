// AUTHORED-BY Claude Fable 5
//
// Case-planning honesty: what runs, what skips, and why — plus the
// statement-verdict aggregation rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCase } from '../lib/exchange.mjs';
import { classifyStatement } from '../lib/plan.mjs';
import { DEFAULT_CONFIG } from '../lib/config.mjs';

const config = { ...DEFAULT_CONFIG, target: 'http://127.0.0.1:9', agents: {} };
const httpCase = (over = {}) => ({
  id: 't/x',
  operation: 'http-exchange',
  input: { state: { storageRoot: 'https://s.example/a/', resources: {} }, request: { method: 'GET', target: 'https://s.example/a/x' } },
  ...over,
});

test('planCase: library-level operations never execute black-box', () => {
  const plan = planCase({ id: 'auth/x', operation: 'validate-access-token', input: {} }, config);
  assert.equal(plan.run, false);
  assert.equal(plan.reason, 'library-vector');
});

test('planCase: unprovided preconditions skip conformantly', () => {
  const c = httpCase({ preconditions: { features: ['storage-quota'] } });
  assert.deepEqual(planCase(c, config).reason, 'precondition');
  assert.equal(planCase(c, { ...config, features: ['storage-quota'] }).run, true);
  const cc = httpCase({ preconditions: { capabilities: ['MoveResource'] } });
  assert.equal(planCase(cc, config).reason, 'precondition');
});

test('planCase: injection-only state members are unrealizable', () => {
  for (const key of ['trustedIssuers', 'now', 'popSession', 'notificationService', 'quotaRemainingBytes']) {
    const c = httpCase();
    c.input.state[key] = 'x';
    assert.equal(planCase(c, config).reason, 'unrealizable-state', key);
  }
});

test('planCase: capabilities/conformsTo match the target declaration', () => {
  const c = httpCase();
  c.input.state.capabilities = [{ type: 'ContentNegotiation', source: 'text/turtle' }];
  assert.equal(planCase(c, config).reason, 'unrealizable-state');
  assert.equal(planCase(c, { ...config, capabilities: ['ContentNegotiation'] }).run, true);
});

test('planCase: an explicitly EMPTY declaration pin is unrealizable on a declaring target', () => {
  // The transform-off vectors pin `"capabilities": []` — the storage with the
  // surface switched OFF. A black-box harness cannot toggle a declared
  // capability off, so against a declaring target the state is unrealisable
  // (never a false failure); against a declaring-nothing target it runs.
  const c = httpCase();
  c.input.state.capabilities = [];
  assert.equal(
    planCase(c, { ...config, capabilities: ['ContentNegotiation'] }).reason,
    'unrealizable-state',
  );
  assert.equal(planCase(c, config).run, true);
  // Same rule for conformsTo…
  const cc = httpCase();
  cc.input.state.conformsTo = [];
  assert.equal(
    planCase(cc, { ...config, conformsTo: ['https://w3id.org/jeswr/lws/protocol/core/1.0'] }).reason,
    'unrealizable-state',
  );
  // …and an ABSENT key still means "no pin" — a declaring target runs it.
  assert.equal(
    planCase(httpCase(), { ...config, capabilities: ['ContentNegotiation'] }).run,
    true,
  );
});

test('planCase: access map matters only when a request authenticates as an agent', () => {
  const controllerOnly = httpCase();
  controllerOnly.input.state.access = { 'https://id.example/bob': {} };
  assert.equal(planCase(controllerOnly, config).run, true);

  const asBob = httpCase();
  asBob.input.state.access = { 'https://id.example/bob': {} };
  asBob.input.request = { ...asBob.input.request, agent: 'https://id.example/bob' };
  assert.equal(planCase(asBob, config).reason, 'unrealizable-state');

  const withRealizer = { ...config, accessRealizer: 'wac', agents: { 'https://id.example/bob': { bearer: 't' } } };
  assert.equal(planCase(asBob, withRealizer).run, true);
});

test('planCase: agent without a credential seam is unrealizable', () => {
  const c = httpCase();
  c.input.request = { ...c.input.request, agent: 'https://id.example/bob' };
  assert.equal(planCase(c, config).reason, 'unrealizable-agent');
  assert.equal(planCase(c, { ...config, agents: { 'https://id.example/bob': { bearer: 't' } } }).run, true);
});

test('planCase: literal time-conditionals cannot be realised (mtimes are unpinnable)', () => {
  const c = httpCase();
  c.input.request = { ...c.input.request, headers: { 'If-Modified-Since': 'Wed, 01 Jul 2026 00:00:00 GMT' } };
  assert.equal(planCase(c, config).reason, 'unrealizable-state');
  const ph = httpCase({
    exchanges: [
      { request: { method: 'GET', target: 'https://s.example/a/x' }, expected: {} },
      { request: { method: 'GET', target: 'https://s.example/a/x', headers: { 'If-Modified-Since': '${response[0].header.Last-Modified}' } }, expected: {} },
    ],
  });
  assert.equal(planCase(ph, config).run, true);
});

// --- statement classification -----------------------------------------------

const stmt = (over = {}) => ({
  id: 'JLWSC-X-1',
  spec: 'core',
  level: 'MUST',
  subjects: ['Server'],
  testability: 'E',
  testCases: [],
  testGap: null,
  statement: 'x',
  anchor: 'https://x#y',
  comment: null,
  ...over,
});

test('classifyStatement: non-server classes are not applicable to a server harness', () => {
  for (const subject of ['Client', 'AuthorizationServer', 'RdfAwareClient', 'WebhookReceiver', 'AccessDocument']) {
    assert.equal(classifyStatement(stmt({ subjects: [subject] }), new Map()).category, 'not-applicable', subject);
  }
  // Mixed-subject statements bind the server too.
  assert.notEqual(classifyStatement(stmt({ subjects: ['Server', 'Client'] }), new Map()).category, 'not-applicable');
});

test('classifyStatement: audit classes are evidence-checks, P is premature', () => {
  assert.equal(classifyStatement(stmt({ testability: 'A-exist' }), new Map()).category, 'audit-evidence');
  assert.equal(classifyStatement(stmt({ testability: 'A-int' }), new Map()).category, 'audit-evidence');
  assert.equal(classifyStatement(stmt({ testability: 'P' }), new Map()).category, 'premature');
});

test('classifyStatement: enforceable verdict aggregation and precedence', () => {
  const s = stmt({ testCases: ['a/1', 'a/2'] });
  const m = (d1, d2) => new Map([
    ['a/1', { disposition: d1 }],
    ['a/2', { disposition: d2 }],
  ]);
  assert.equal(classifyStatement(stmt(), new Map()).category, 'no-vector');
  assert.equal(classifyStatement(s, m('pass', 'pass')).category, 'pass');
  assert.equal(classifyStatement(s, m('pass', 'fail')).category, 'fail');
  assert.equal(classifyStatement(s, m('pass', 'skip-unrealizable-state')).category, 'pass');
  // Partial runs: a filtered-out sibling forbids a statement-level pass,
  // but never masks a real failure or a more specific non-execution
  // diagnostic (setup error / unrealizable / precondition).
  assert.equal(classifyStatement(s, m('pass', 'skip-filtered')).category, 'untested-filtered');
  assert.equal(classifyStatement(s, m('fail', 'skip-filtered')).category, 'fail');
  assert.equal(classifyStatement(s, m('error-setup', 'skip-filtered')).category, 'untested-setup-error');
  assert.equal(classifyStatement(s, m('skip-unrealizable-state', 'skip-filtered')).category, 'untested-unrealizable');
  assert.equal(classifyStatement(s, m('skip-precondition', 'skip-filtered')).category, 'untested-precondition');
  assert.equal(classifyStatement(s, m('skip-filtered', 'skip-filtered')).category, 'untested-filtered');
  assert.equal(classifyStatement(s, m('error-setup', 'skip-precondition')).category, 'untested-setup-error');
  assert.equal(classifyStatement(s, m('skip-unrealizable-state', 'skip-precondition')).category, 'untested-unrealizable');
  assert.equal(classifyStatement(s, m('skip-precondition', 'skip-library-vector')).category, 'untested-precondition');
  assert.equal(classifyStatement(s, m('skip-library-vector', 'skip-library-vector')).category, 'untested-library');
});
