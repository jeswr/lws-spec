// AUTHORED-BY Claude Fable 5
//
// Loads the machine-readable normative-statement companions
// (../index.statements.ttl, ../rdf-transform.statements.ttl — the
// jeswr/spec-companion format) and returns the statement records the runner
// keys its report off. The companions are the requirement index: the suite
// never re-derives requirements from the spec text.

import { readFileSync } from 'node:fs';
import { Parser } from 'n3';

const SPEC = 'http://www.w3.org/ns/spec#';
const SC = 'https://w3id.org/jeswr/spec-companion#';
const DCTERMS = 'http://purl.org/dc/terms/';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const LEVELS = new Map([
  [`${SPEC}MUST`, 'MUST'],
  [`${SPEC}MUSTNOT`, 'MUST NOT'],
  [`${SPEC}SHOULD`, 'SHOULD'],
  [`${SPEC}SHOULDNOT`, 'SHOULD NOT'],
  [`${SPEC}MAY`, 'MAY'],
]);

// The E / A-int / A-exist / P testability spine.
const TESTABILITY = new Map([
  [`${SC}Enforceable`, 'E'],
  [`${SC}AccountableIntegrity`, 'A-int'],
  [`${SC}AccountableExistence`, 'A-exist'],
  [`${SC}Premature`, 'P'],
]);

const fragment = (iri) => {
  const i = iri.indexOf('#');
  return i === -1 ? iri : iri.slice(i + 1);
};

// A spec:testCase IRI resolves (via the companion's @base) to
// https://…/test-vectors/vectors/<suite>/cases/<case>/case.json ;
// the runner keys cases by "<suite>/<case>".
const caseIdFromIri = (iri) => {
  const m = /\/test-vectors\/vectors\/([^/]+)\/cases\/(.+)\/case\.json$/.exec(iri);
  return m ? `${m[1]}/${m[2]}` : null;
};

/**
 * Parse one companion file.
 * @returns {{ statements: Array, meta: object }}
 */
export function loadCompanion(path, specKey) {
  const ttl = readFileSync(path, 'utf8');
  // The companion carries its own @base; give the parser a matching document
  // IRI so relative IRIs resolve identically when @base is absent.
  const parser = new Parser({ baseIRI: 'https://jeswr.github.io/lws-spec/' });
  const quads = parser.parse(ttl);

  const bySubject = new Map();
  for (const q of quads) {
    const s = q.subject.value;
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(q);
  }

  const objects = (subj, pred) =>
    (bySubject.get(subj) ?? []).filter((q) => q.predicate.value === pred).map((q) => q.object);
  const one = (subj, pred) => objects(subj, pred)[0];

  // Companion-document metadata (the subject typed sc:CompanionDocument).
  let meta = {};
  for (const [subj, qs] of bySubject) {
    if (qs.some((q) => q.predicate.value === RDF_TYPE && q.object.value === `${SC}CompanionDocument`)) {
      meta = {
        iri: subj,
        specVersion: one(subj, `${SC}specVersion`)?.value ?? null,
        companionOf: one(subj, `${SC}companionOf`)?.value ?? null,
      };
      break;
    }
  }

  const statements = [];
  for (const [subj, qs] of bySubject) {
    if (!qs.some((q) => q.predicate.value === RDF_TYPE && q.object.value === `${SPEC}Requirement`)) continue;

    const id = one(subj, `${DCTERMS}identifier`)?.value ?? fragment(subj);
    const levelIri = one(subj, `${SPEC}requirementLevel`)?.value;
    const testabilityIri = one(subj, `${SC}testability`)?.value;
    const caseRefs = objects(subj, `${SPEC}testCase`).map((o) => o.value);
    const testCases = caseRefs.map(caseIdFromIri).filter(Boolean);
    // A spec:testCase outside this repo's vectors/ tree references an external
    // suite adopted by reference (e.g. the agentic-solid-conformance
    // odrl-delegation vectors) — reported as such, never dropped.
    const externalTestCases = caseRefs.filter((iri) => caseIdFromIri(iri) === null);

    statements.push({
      id,
      iri: subj,
      spec: specKey,
      statement: one(subj, `${SPEC}statement`)?.value ?? '',
      level: LEVELS.get(levelIri) ?? levelIri ?? null,
      subjects: objects(subj, `${SPEC}requirementSubject`).map((o) => fragment(o.value)),
      testability: TESTABILITY.get(testabilityIri) ?? testabilityIri ?? null,
      anchor: one(subj, `${SC}anchor`)?.value ?? null,
      testCases,
      externalTestCases,
      testGap: one(subj, `${SC}testGap`)?.value
        ? fragment(one(subj, `${SC}testGap`).value)
        : null,
      comment: one(subj, `${RDFS}comment`)?.value ?? null,
    });
  }

  statements.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { statements, meta };
}

/** Load both companions from the repo root. */
export function loadCompanions(repoRoot) {
  const core = loadCompanion(`${repoRoot}/index.statements.ttl`, 'core');
  const rdf = loadCompanion(`${repoRoot}/rdf-transform.statements.ttl`, 'rdf-transform');
  return {
    statements: [...core.statements, ...rdf.statements],
    meta: { core: core.meta, 'rdf-transform': rdf.meta },
  };
}
