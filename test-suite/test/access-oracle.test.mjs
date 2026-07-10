// AUTHORED-BY Claude Fable 5
//
// Adversarial regression tests for the NORMATIVE access-decision rule set
// (semantics/access-decision.n3), executed through the same oracle encoder
// the vector diff uses (tools/oracle-access.mjs). These probe the decision
// function BEYOND the committed vectors: each case is an attempt to break a
// fail-closed property by construction (prefix escapes, widening injection,
// malformed constraints, undefined rule kinds). The committed vectors are the
// positive samples; these are the attacks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, EncodeError } from '../tools/oracle-access.mjs';

const PROFILE = 'https://w3id.org/jeswr/lws/access-profile/odrl-1';
const BOB = 'https://id.example/bob';
const NOTES = 'https://storage.example/alice/notes/';

const grant = (permission, over = {}) => ({
  '@type': 'Offer',
  uid: 'https://storage.example/alice/.grants/t-1',
  profile: PROFILE,
  permission,
  ...over,
});
const request = (action, target, context = { dateTime: '2026-07-01T12:00:00Z' }) => ({
  agent: BOB, action, target, context,
});

// --- target-coverage prefix safety -----------------------------------------

test('recursive container grant does NOT cover a sibling sharing the name prefix', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'Container', uid: NOTES, recursive: true } }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', 'https://storage.example/alice/notes-evil.txt') }),
    'deny',
  );
});

test('a recursive Container uid WITHOUT a trailing slash grants no prefix coverage (path-alignment guard)', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'Container', uid: 'https://storage.example/alice/notes', recursive: true } }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', 'https://storage.example/alice/notes/deep.txt') }),
    'deny',
  );
});

test('StorageResource uid without a trailing slash grants no prefix coverage', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'StorageResource', uid: 'https://storage.example/alice' } }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', 'https://storage.example/alice/x.txt') }),
    'deny',
  );
});

// --- action lattice ----------------------------------------------------------

test('a profile-defined action satisfies a grant of itself: create granted, create requested', async () => {
  const g = grant([{ assignee: BOB, action: 'create', target: { '@type': 'Container', uid: NOTES, recursive: true } }]);
  assert.equal(
    await decide({ grants: [g], request: request('create', `${NOTES}new.txt`) }),
    'permit',
  );
});

test('a request for an action outside the profile is denied even against a modify grant', async () => {
  const g = grant([{ assignee: BOB, action: 'modify', target: { '@type': 'Container', uid: NOTES, recursive: true } }]);
  assert.equal(
    await decide({ grants: [g], request: request('https://extension.example/administer', `${NOTES}a.txt`) }),
    'deny',
  );
});

// --- untrusted-document containment ------------------------------------------

test('a hostile document field cannot inject widening facts: the encoder rejects unknown fields structurally', async () => {
  // The strict-profile encoder maps only the documented fields; there is no
  // JSON field that produces odrl:includedIn triples. A document attempting
  // an unknown action name (a would-be lattice edge) fails the encode.
  const g = grant([{ assignee: BOB, action: 'superpower', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  await assert.rejects(
    decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('a grant carrying a prohibition rule derives nothing (undefined composition fails closed)', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { prohibition: [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('an unprofiled grant derives nothing (profile declaration is REQUIRED)', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  delete g.profile;
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('a permission without an assignee matches no request', async () => {
  const g = grant([{ action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

// --- constraint fail-closure ---------------------------------------------------

test('a constraint whose left operand the profile does not define is unsatisfied (fail closed)', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [{ leftOperand: 'https://extension.example/geo', operator: 'eq', rightOperand: 'https://geo.example/eu' }],
  }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('a constraint whose operator is outside the supported set is unsatisfied: dateTime gt', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [{ leftOperand: 'dateTime', operator: 'gt', rightOperand: { '@value': '2026-01-01T00:00:00Z', '@type': 'xsd:dateTime' } }],
  }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('a constraint over a context value the request does not carry is unsatisfied', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [{ leftOperand: 'purpose', operator: 'eq', rightOperand: 'https://purpose.example/collaboration' }],
  }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`, { dateTime: '2026-07-01T12:00:00Z' }) }),
    'deny',
  );
});

test('a malformed constraint (no operator) can never be satisfied', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [{ leftOperand: 'purpose', rightOperand: 'https://purpose.example/collaboration' }],
  }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`, { dateTime: '2026-07-01T12:00:00Z', purpose: 'https://purpose.example/collaboration' }) }),
    'deny',
  );
});

test('a malformed constraint (no rightOperand) can never be satisfied', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [{ leftOperand: 'purpose', operator: 'eq' }],
  }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`, { dateTime: '2026-07-01T12:00:00Z', purpose: 'https://purpose.example/collaboration' }) }),
    'deny',
  );
});

test('dateTime lt is strict: a request AT the bound instant is denied', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [{ leftOperand: 'dateTime', operator: 'lt', rightOperand: { '@value': '2026-07-01T12:00:00Z', '@type': 'xsd:dateTime' } }],
  }]);
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('one unsatisfied constraint among satisfied ones denies (conjunction, not majority)', async () => {
  const g = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
    constraint: [
      { leftOperand: 'purpose', operator: 'eq', rightOperand: 'https://purpose.example/collaboration' },
      { leftOperand: 'dateTime', operator: 'lt', rightOperand: { '@value': '2026-06-01T00:00:00Z', '@type': 'xsd:dateTime' } },
    ],
  }]);
  assert.equal(
    await decide({
      grants: [g],
      request: request('read', `${NOTES}a.txt`, { dateTime: '2026-07-01T12:00:00Z', purpose: 'https://purpose.example/collaboration' }),
    }),
    'deny',
  );
});

// --- revocation composition -----------------------------------------------------

test('two covering grants: revoking one leaves the request permitted by the other; revoking both denies', async () => {
  const g1 = grant([{ assignee: BOB, action: 'read', target: { '@type': 'Container', uid: NOTES, recursive: true } }]);
  const g2 = {
    ...grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}deep/file.txt` } }]),
    uid: 'https://storage.example/alice/.grants/t-2',
  };
  const req = request('read', `${NOTES}deep/file.txt`);
  assert.equal(await decide({ grants: [g1, g2], request: req }), 'permit');
  assert.equal(await decide({ grants: [g2], request: req }), 'permit');
  assert.equal(await decide({ grants: [], request: req }), 'deny');
});
