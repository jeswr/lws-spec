#!/usr/bin/env node
// AUTHORED-BY Claude Fable 5
//
// Access-decision oracle — executes the NORMATIVE rule set
// semantics/access-decision.n3 (EYE / eyereasoner) over every committed
// `evaluate-access` test vector and diffs the derived decision against the
// vector's expected decision.
//
//   node test-suite/tools/oracle-access.mjs            # all evaluate-access vectors
//   node test-suite/tools/oracle-access.mjs --dump <id>  # also print one case's
//                                                        # encoded N3 + derivations
//
// The rule set is the DEFINITION of the profile's decision function
// (core#odrl-profile); the vectors are point-wise samples of it. This oracle
// is the consistency gate between the two: it MUST exit 0 (every derived
// decision equal to the expected one) for the suite to be coherent. A permit
// is the presence of at least one derived `ax:permittedBy` justification; a
// deny is its closed-world absence (empty derivation).
//
// ENCODING: this file implements the JSON-document -> N3 mapping documented
// in semantics/README.md (and the header of semantics/access-decision.n3).
// It maps ONLY the strict profile's document fields; in particular no field
// of an evaluated document can produce `odrl:includedIn` / `ax:KnownAction`
// facts (the untrusted-input invariant). Unknown context keys, actions,
// operands, or operators outside the profile's tables and not absolute
// http(s) IRIs are an encode ERROR (fail loud), never silently dropped.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { n3reasoner } from 'eyereasoner';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const VECTORS = join(REPO, 'test-vectors', 'vectors');
const RULES = readFileSync(join(REPO, 'semantics', 'access-decision.n3'), 'utf8');
const QUERY = readFileSync(join(REPO, 'semantics', 'access-decision.query.n3'), 'utf8');

const ODRL = 'http://www.w3.org/ns/odrl/2/';
const JLWS = 'https://w3id.org/jeswr/lws#';

// ---------------------------------------------------------------------------
// N3 term encoders (fail-loud on anything outside the profile's shape).
// ---------------------------------------------------------------------------

class EncodeError extends Error {}

const isAbsolute = (s) => typeof s === 'string' && /^https?:\/\/\S+$/.test(s)
  && !/[<>"{}|\\^`\s]/.test(s);

const iri = (s) => {
  if (!isAbsolute(s)) throw new EncodeError(`not an encodable IRI: ${JSON.stringify(s)}`);
  return `<${s}>`;
};

const lit = (s) => {
  if (typeof s !== 'string') throw new EncodeError(`not an encodable literal: ${JSON.stringify(s)}`);
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
};

const mapped = (table, ns, label) => (v) => {
  if (typeof v === 'string' && table.has(v)) return `<${ns}${table.get(v)}>`;
  if (isAbsolute(v)) return `<${v}>`;
  throw new EncodeError(`unknown ${label}: ${JSON.stringify(v)}`);
};

// Actions bullet of #odrl-profile: odrl core read/modify/delete + the two
// profile-defined jlws actions.
const action = mapped(
  new Map([['read', 'read'], ['modify', 'modify'], ['delete', 'delete']]
    .map(([k, v]) => [k, v])), ODRL, 'action',
);
const jlwsActions = new Set(['create', 'append']);
const mapAction = (v) => (jlwsActions.has(v) ? `<${JLWS}${v}>` : action(v));

const mapTargetType = mapped(
  new Map([['DataResource', 'DataResource'], ['Container', 'Container'],
    ['StorageResource', 'StorageResource']]), JLWS, 'target @type',
);

// Constraints bullet: profile left operands + operators.
const mapLeftOperand = (v) => {
  if (v === 'purpose' || v === 'dateTime') return `<${ODRL}${v}>`;
  if (v === 'client' || v === 'mediaType' || v === 'resourceType') return `<${JLWS}${v}>`;
  if (isAbsolute(v)) return `<${v}>`;
  throw new EncodeError(`unknown constraint leftOperand: ${JSON.stringify(v)}`);
};
const mapOperator = mapped(
  new Map([['eq', 'eq'], ['lt', 'lt'], ['gt', 'gt'], ['lteq', 'lteq'],
    ['gteq', 'gteq'], ['neq', 'neq']]), ODRL, 'constraint operator',
);
const mapRightOperand = (v) => {
  if (v && typeof v === 'object' && '@value' in v) return lit(v['@value']);
  if (isAbsolute(v)) return `<${v}>`;
  return lit(v);
};

// Canonical RFC 3339 UTC instant — fixed width, "Z", no fractional seconds —
// the only form under which lexicographic order is chronological. Anything
// else (including a real-but-non-canonical offset form, or a lexically
// invalid date) is an encode error: a malformed bound MUST NOT be allowed to
// masquerade as a comparable instant (it would sort arbitrarily — e.g.
// "zzzz" after every real instant, i.e. "never expires").
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const instant = (v) => {
  if (typeof v !== 'string' || !CANONICAL_INSTANT.test(v) || Number.isNaN(Date.parse(v))) {
    throw new EncodeError(`not a canonical RFC 3339 UTC instant: ${JSON.stringify(v)}`);
  }
  return lit(v);
};

// A dateTime constraint bound must be xsd:dateTime-typed (or a bare string)
// AND canonical; a foreign datatype on an instant is an encode error, never
// silently lowered into a comparable string.
const XSD_DATETIME = new Set(['xsd:dateTime', 'http://www.w3.org/2001/XMLSchema#dateTime']);
const mapDateTimeOperand = (v) => {
  if (v && typeof v === 'object' && '@value' in v) {
    if (!XSD_DATETIME.has(v['@type'])) {
      throw new EncodeError(`dateTime bound carries a non-xsd:dateTime datatype: ${JSON.stringify(v['@type'])}`);
    }
    return instant(v['@value']);
  }
  return instant(v);
};

// Request context: the profile left-operand IRIs ARE the context keys.
const CONTEXT_KEYS = new Map([
  ['dateTime', { pred: `<${ODRL}dateTime>`, kind: 'instant' }],
  ['purpose', { pred: `<${ODRL}purpose>`, kind: 'auto' }],
  ['client', { pred: `<${JLWS}client>`, kind: 'auto' }],
  ['mediaType', { pred: `<${JLWS}mediaType>`, kind: 'literal' }],
  ['resourceType', { pred: `<${JLWS}resourceType>`, kind: 'auto' }],
]);
const contextValue = (kind, v) => {
  if (kind === 'instant') return instant(v);
  if (kind === 'literal') return lit(v);
  return isAbsolute(v) ? `<${v}>` : lit(v);
};

const toArray = (v) => (v === undefined || v === null ? [] : (Array.isArray(v) ? v : [v]));

// ---------------------------------------------------------------------------
// Case encoding: recorded grants + the request under decision.
// ---------------------------------------------------------------------------

let bnodeCounter = 0;
const bnode = (hint) => `_:b${hint}${bnodeCounter += 1}`;

function encodeGrant(grant, lines) {
  const subj = grant.uid ? iri(grant.uid) : bnode('g');
  // Strict: only the profile's two document types encode; a missing or
  // unknown @type is an encode error — NEVER fabricated into an odrl:Offer
  // (an Offer is what the permit rule keys on).
  const type = grant['@type'];
  if (type !== 'Offer' && type !== 'Request') {
    throw new EncodeError(`grant record with missing/unknown @type: ${JSON.stringify(type)}`);
  }
  lines.push(`${subj} a <${ODRL}${type}> .`);
  if (grant.profile !== undefined) lines.push(`${subj} <${ODRL}profile> ${iri(grant.profile)} .`);
  lines.push(`${subj} <https://w3id.org/jeswr/lws/authz#recordedIn> <https://w3id.org/jeswr/lws/authz#GrantStore> .`);
  for (const kind of ['permission', 'prohibition', 'obligation']) {
    for (const rule of toArray(grant[kind])) {
      const p = bnode('p');
      lines.push(`${subj} <${ODRL}${kind}> ${p} .`);
      if (rule.assignee !== undefined) lines.push(`${p} <${ODRL}assignee> ${iri(rule.assignee)} .`);
      for (const a of toArray(rule.action)) lines.push(`${p} <${ODRL}action> ${mapAction(a)} .`);
      for (const t of toArray(rule.target)) {
        const tn = bnode('t');
        lines.push(`${p} <${ODRL}target> ${tn} .`);
        if (t['@type'] !== undefined) lines.push(`${tn} a ${mapTargetType(t['@type'])} .`);
        if (t.uid !== undefined) lines.push(`${tn} <${ODRL}uid> ${iri(t.uid)} .`);
        if (t.recursive === true) lines.push(`${tn} <${JLWS}recursive> true .`);
      }
      for (const c of toArray(rule.constraint)) {
        const cn = bnode('c');
        lines.push(`${p} <${ODRL}constraint> ${cn} .`);
        const left = c.leftOperand !== undefined ? mapLeftOperand(c.leftOperand) : undefined;
        if (left !== undefined) lines.push(`${cn} <${ODRL}leftOperand> ${left} .`);
        if (c.operator !== undefined) lines.push(`${cn} <${ODRL}operator> ${mapOperator(c.operator)} .`);
        if (c.rightOperand !== undefined) {
          const isInstantOperand = left === `<${ODRL}dateTime>`;
          lines.push(`${cn} <${ODRL}rightOperand> ${isInstantOperand
            ? mapDateTimeOperand(c.rightOperand) : mapRightOperand(c.rightOperand)} .`);
        }
      }
    }
  }
}

function encodeCase(input) {
  bnodeCounter = 0;
  const lines = [];
  for (const grant of toArray(input.grants)) encodeGrant(grant, lines);
  const req = input.request;
  const r = bnode('req');
  const ctx = bnode('ctx');
  lines.push(`${r} a <https://w3id.org/jeswr/lws/authz#Request> .`);
  lines.push(`${r} <https://w3id.org/jeswr/lws/authz#agent> ${iri(req.agent)} .`);
  lines.push(`${r} <https://w3id.org/jeswr/lws/authz#action> ${mapAction(req.action)} .`);
  lines.push(`${r} <https://w3id.org/jeswr/lws/authz#target> ${iri(req.target)} .`);
  lines.push(`${r} <https://w3id.org/jeswr/lws/authz#context> ${ctx} .`);
  for (const [k, v] of Object.entries(req.context ?? {})) {
    const spec = CONTEXT_KEYS.get(k);
    if (!spec) throw new EncodeError(`unknown request context key: ${JSON.stringify(k)}`);
    lines.push(`${ctx} ${spec.pred} ${contextValue(spec.kind, v)} .`);
  }
  return lines.join('\n');
}

/**
 * Derive the decision for one evaluate-access input by executing the
 * normative rule set. Exported for the adversarial regression tests
 * (test/access-oracle.test.mjs), which probe the rule set beyond the
 * committed vectors.
 * @returns {Promise<'permit'|'deny'>}
 */
export async function decide(input) {
  const data = encodeCase(input);
  const out = await n3reasoner([data, RULES], QUERY);
  return /permittedBy/.test(out) ? 'permit' : 'deny';
}

/**
 * Derive the decision for a RAW, already-encoded N3 input — bypassing the
 * encoder's validation. Exported so the tests can prove the rule set ITSELF
 * fails closed on inputs a non-oracle embedder might feed it unvalidated
 * (e.g. a malformed dateTime bound).
 * @returns {Promise<'permit'|'deny'>}
 */
export async function decideRaw(dataN3) {
  const out = await n3reasoner([dataN3, RULES], QUERY);
  return /permittedBy/.test(out) ? 'permit' : 'deny';
}

export { encodeCase, EncodeError };

// ---------------------------------------------------------------------------
// Vector discovery + the diff loop (CLI entry).
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (!isMain) {
  // imported as a library (the tests) — skip the CLI loop
} else {
  await main();
}

async function main() {
const cases = [];
for (const suite of readdirSync(VECTORS)) {
  const casesDir = join(VECTORS, suite, 'cases');
  if (!existsSync(casesDir)) continue;
  for (const name of readdirSync(casesDir)) {
    const file = join(casesDir, name, 'case.json');
    if (!existsSync(file)) continue;
    const c = JSON.parse(readFileSync(file, 'utf8'));
    if (c.operation === 'evaluate-access') cases.push(c);
  }
}
cases.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const dumpId = process.argv.includes('--dump')
  ? process.argv[process.argv.indexOf('--dump') + 1] : null;

let pass = 0;
const failures = [];
for (const c of cases) {
  let derived;
  let detail = '';
  try {
    const data = encodeCase(c.input);
    const out = await n3reasoner([data, RULES], QUERY);
    derived = /permittedBy/.test(out) ? 'permit' : 'deny';
    if (dumpId && (c.id === dumpId || c.id.endsWith(`/${dumpId}`))) {
      console.log(`--- encoded ${c.id}\n${data}\n--- derivations\n${out}\n---`);
    }
  } catch (e) {
    derived = 'ERROR';
    detail = ` (${e.message})`;
  }
  const expected = c.expected?.decision;
  if (derived === expected) {
    pass += 1;
    console.log(`ok   ${c.id} — ${expected}`);
  } else {
    failures.push(c.id);
    console.log(`FAIL ${c.id} — derived=${derived} expected=${expected}${detail}`);
  }
}

console.log(`\naccess-decision oracle: ${pass}/${cases.length} evaluate-access vectors reproduced by semantics/access-decision.n3`);
if (cases.length === 0) { console.error('no evaluate-access vectors found'); process.exit(1); }
process.exit(failures.length === 0 ? 0 : 1);
}
