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
import { decide, decideRaw, EncodeError } from '../tools/oracle-access.mjs';

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

// --- prohibition / obligation composition (semantics/access-decision.n3 M/N/O) ---
// The committed vectors (prohibition-denies-despite-permission,
// unmet-obligation-fail-closed, obligation-for-different-action-not-blocking)
// pin the positive samples; these probe the composition is properly SCOPED —
// matching-based, not a blanket "grant carries the rule kind" veto — and that
// it composes per grant, never globally.

test('a matching prohibition denies despite an otherwise-matching permission (odrl:prohibit conflict-resolution strategy)', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { prohibition: [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('a NON-matching prohibition (different target) in the same grant does not block the permission', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { prohibition: [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}other.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'permit',
  );
});

test('a NON-matching prohibition (different assignee) in the same grant does not block the permission', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { prohibition: [{ assignee: 'https://id.example/carol', action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'permit',
  );
});

test('a matching obligation makes the permission NOT exercisable: no discharge mechanism exists, so it is always unmet', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { obligation: [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'deny',
  );
});

test('a NON-matching obligation (different action) in the same grant does not block the permission', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { obligation: [{ assignee: BOB, action: 'append', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'permit',
  );
});

test('prohibition/obligation composition is PER GRANT, never global: a prohibition in a DIFFERENT recorded grant does not block this grant\'s permit', async () => {
  const permitting = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  const prohibiting = {
    '@type': 'Offer',
    uid: 'https://storage.example/alice/.grants/t-2',
    profile: PROFILE,
    prohibition: [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
  };
  assert.equal(
    await decide({ grants: [permitting, prohibiting], request: request('read', `${NOTES}a.txt`) }),
    'permit',
  );
});

test('prohibition/obligation composition is PER GRANT, never global: an obligation in a DIFFERENT recorded grant does not block this grant\'s permit', async () => {
  const permitting = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  const obligating = {
    '@type': 'Offer',
    uid: 'https://storage.example/alice/.grants/t-2',
    profile: PROFILE,
    obligation: [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
  };
  assert.equal(
    await decide({ grants: [permitting, obligating], request: request('read', `${NOTES}a.txt`) }),
    'permit',
  );
});

test('a prohibition without an assignee never matches (fail closed like a permission without an assignee), so it does not block', async () => {
  const g = grant(
    [{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }],
    { prohibition: [{ action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }] },
  );
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    'permit',
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

// --- dateTime canonical-form fail-closure ----------------------------------------
// A malformed bound must never masquerade as a comparable instant: "zzzz"
// sorts after every real timestamp, so without validation an lt-constraint
// with a garbage bound would behave as "never expires" (fail OPEN). Both
// layers close it: the encoder rejects, and the rule set independently
// derives unsatisfiedFor on any non-canonical lexical form.

const dtGrant = (rightOperand) => grant([{
  assignee: BOB,
  action: 'read',
  target: { '@type': 'DataResource', uid: `${NOTES}a.txt` },
  constraint: [{ leftOperand: 'dateTime', operator: 'lt', rightOperand }],
}]);

test('encoder rejects a lexically malformed dateTime bound', async () => {
  await assert.rejects(
    decide({ grants: [dtGrant({ '@value': 'zzzz', '@type': 'xsd:dateTime' })], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('encoder rejects a dateTime bound carrying a foreign datatype', async () => {
  await assert.rejects(
    decide({ grants: [dtGrant({ '@value': '2026-12-31T00:00:00Z', '@type': 'xsd:string' })], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('encoder rejects a non-UTC (offset) dateTime bound — only the canonical Z form is comparable', async () => {
  await assert.rejects(
    decide({ grants: [dtGrant({ '@value': '2026-12-31T02:00:00+02:00', '@type': 'xsd:dateTime' })], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('encoder rejects a fractional-seconds dateTime bound (breaks fixed-width lexicographic order)', async () => {
  await assert.rejects(
    decide({ grants: [dtGrant({ '@value': '2026-12-31T00:00:00.500Z', '@type': 'xsd:dateTime' })], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('encoder rejects a calendar-invalid dateTime bound (month 13)', async () => {
  await assert.rejects(
    decide({ grants: [dtGrant({ '@value': '2026-13-01T00:00:00Z', '@type': 'xsd:dateTime' })], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('encoder rejects nonexistent calendar instants Date.parse would normalize', async () => {
  // Date.parse silently maps 2027-02-30 -> Mar 2, 04-31 -> May 1, and
  // T24:00 -> next-day midnight; each must be an encode error, not a
  // comparable (widened) bound.
  for (const v of [
    '2027-02-30T00:00:00Z', // February 30th
    '2027-02-29T00:00:00Z', // Feb 29 in a non-leap year
    '1900-02-29T00:00:00Z', // Feb 29 in a non-leap century year
    '2027-04-31T00:00:00Z', // 31st of a 30-day month
    '2027-01-01T24:00:00Z', // hour 24
    '2027-01-01T12:60:00Z', // minute 60
    '2027-00-10T00:00:00Z', // month 00
    '2026-99-99T99:99:99Z', // digit garbage in every field
  ]) {
    await assert.rejects(
      decide({ grants: [dtGrant({ '@value': v, '@type': 'xsd:dateTime' })], request: request('read', `${NOTES}a.txt`) }),
      EncodeError,
      v,
    );
  }
});

test('encoder accepts real leap days (2028-02-29, 2000-02-29) as bounds', async () => {
  for (const v of ['2028-02-29T00:00:00Z', '2000-02-29T00:00:00Z']) {
    // 2000-02-29 is in the past relative to the request instant, so the
    // lt-constraint is unsatisfied -> deny; 2028 bound -> permit. Both must
    // ENCODE (no EncodeError): validity of the instant, not of the outcome.
    const expected = v.startsWith('2028') ? 'permit' : 'deny';
    assert.equal(
      await decide({ grants: [dtGrant({ '@value': v, '@type': 'xsd:dateTime' })], request: request('read', `${NOTES}a.txt`) }),
      expected,
      v,
    );
  }
});

test('encoder rejects a malformed request-context dateTime', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  await assert.rejects(
    decide({ grants: [g], request: request('read', `${NOTES}a.txt`, { dateTime: 'not-a-time' }) }),
    EncodeError,
  );
});

test('the RULE SET itself fails closed on a malformed dateTime bound (unvalidated embedder input)', async () => {
  const raw = (bound, now) => `
@prefix odrl: <http://www.w3.org/ns/odrl/2/> .
@prefix jlws: <https://w3id.org/jeswr/lws#> .
@prefix ax:   <https://w3id.org/jeswr/lws/authz#> .
<https://storage.example/alice/.grants/raw-1> a odrl:Offer ;
  odrl:profile <https://w3id.org/jeswr/lws/access-profile/odrl-1> ;
  ax:recordedIn ax:GrantStore ;
  odrl:permission [
    odrl:assignee <https://id.example/bob> ;
    odrl:action odrl:read ;
    odrl:target [ a jlws:DataResource ; odrl:uid <https://storage.example/alice/notes/a.txt> ] ;
    odrl:constraint [ odrl:leftOperand odrl:dateTime ; odrl:operator odrl:lt ; odrl:rightOperand ${bound} ]
  ] .
_:req a ax:Request ;
  ax:agent <https://id.example/bob> ;
  ax:action odrl:read ;
  ax:target <https://storage.example/alice/notes/a.txt> ;
  ax:context [ odrl:dateTime ${now} ] .
`;
  // garbage bound sorts after every instant — must still DENY
  assert.equal(await decideRaw(raw('"zzzz"', '"2026-07-01T12:00:00Z"')), 'deny');
  // non-canonical offset form — must DENY (not comparable lexicographically)
  assert.equal(await decideRaw(raw('"2026-12-31T02:00:00+02:00"', '"2026-07-01T12:00:00Z"')), 'deny');
  // malformed request instant — must DENY
  assert.equal(await decideRaw(raw('"2026-12-31T00:00:00Z"', '"zzzz"')), 'deny');
  // NONEXISTENT calendar instants (digit-shaped, sort after real instants,
  // Date.parse would normalize several of them) — must DENY in the rule set
  for (const bad of [
    '2027-02-30T00:00:00Z', '2027-02-29T00:00:00Z', '1900-02-29T00:00:00Z',
    '2027-04-31T00:00:00Z', '2027-01-01T24:00:00Z', '2027-01-01T12:60:00Z',
    '2026-99-99T99:99:99Z',
  ]) {
    assert.equal(await decideRaw(raw(`"${bad}"`, '"2026-07-01T12:00:00Z"')), 'deny', bad);
  }
  // control: the same shape with canonical forms PERMITS, including a real
  // leap-day bound (rule-layer calendar check accepts existing instants)
  assert.equal(await decideRaw(raw('"2026-12-31T00:00:00Z"', '"2026-07-01T12:00:00Z"')), 'permit');
  assert.equal(await decideRaw(raw('"2028-02-29T00:00:00Z"', '"2026-07-01T12:00:00Z"')), 'permit');
});

// --- grant document-type strictness ----------------------------------------------

test('a grant record with a missing @type is an encode error, never fabricated into an Offer', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  delete g['@type'];
  await assert.rejects(
    decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('a grant record with an unknown @type is an encode error', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  g['@type'] = 'Agreement';
  await assert.rejects(
    decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
    EncodeError,
  );
});

test('an odrl:Request document among the records derives nothing (only Offers permit)', async () => {
  const g = grant([{ assignee: BOB, action: 'read', target: { '@type': 'DataResource', uid: `${NOTES}a.txt` } }]);
  g['@type'] = 'Request';
  assert.equal(
    await decide({ grants: [g], request: request('read', `${NOTES}a.txt`) }),
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
