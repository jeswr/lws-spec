// AUTHORED-BY Claude Fable 5
//
// Statement-level classification and verdict aggregation. The report is
// keyed off the statement-companion IDs (index.statements.ttl /
// rdf-transform.statements.ttl); vectors are only ever reached THROUGH a
// statement's spec:testCase wiring, so the suite cannot silently re-derive
// or reinterpret requirements.
//
// Testability spine handling (the E / A-int / A-exist / P classes):
//   E        -> executable: the wired vectors run where the target lets the
//               harness realise them; otherwise the skip reason is reported.
//   A-int /
//   A-exist  -> audit-class: NOT executed; reported as an evidence-check item
//               (implementer/auditor attestation), never as pass/fail.
//   P        -> premature: explicitly untestable today; reported as such.

// Conformance classes a storage-server harness holds to account. Client,
// AuthorizationServer, RdfAwareClient, WebhookReceiver and the client- or
// AS-authored document classes are separate conformance targets.
const SERVER_CLASSES = new Set([
  'Server',
  'NotificationServer',
  'PopCapableServer',
  'RdfTransformingServer',
  'StorageDescriptionDocument', // published by the server
  'CapabilityDocument', // part of the storage description
]);

export const CATEGORIES = [
  'pass',
  'fail',
  'untested-setup-error',
  'untested-unrealizable',
  'untested-precondition',
  'untested-library',
  'untested-filtered',
  'external-suite',
  'no-vector',
  'audit-evidence',
  'premature',
  'not-applicable',
];

export const isServerSide = (statement) => statement.subjects.some((s) => SERVER_CLASSES.has(s));

/**
 * @param {object} statement companion statement record
 * @param {Map<string, {disposition: string, failures?: string[], detail?: string}>} caseResults
 * @returns {{category: string, detail: string, cases: Array}}
 */
export function classifyStatement(statement, caseResults) {
  const cases = statement.testCases.map((id) => {
    const r = caseResults.get(id);
    return { id, ...(r ?? { disposition: 'missing', detail: 'case not found in test-vectors' }) };
  });

  if (!isServerSide(statement)) {
    return {
      category: 'not-applicable',
      detail: `binds ${statement.subjects.join(' + ')} — not the storage server under test`,
      cases,
    };
  }
  if (statement.testability === 'A-int' || statement.testability === 'A-exist') {
    return {
      category: 'audit-evidence',
      detail:
        'audit-class statement (accountable, not enforceable black-box): satisfy by implementation evidence/attestation, not by vector execution',
      cases,
    };
  }
  if (statement.testability === 'P') {
    return {
      category: 'premature',
      detail: 'premature: the spec marks this surface not yet testable',
      cases,
    };
  }

  // Enforceable.
  if (cases.length === 0) {
    if ((statement.externalTestCases ?? []).length > 0) {
      return {
        category: 'external-suite',
        detail: `covered by an external suite adopted by reference: ${statement.externalTestCases.join(', ')}`,
        cases,
      };
    }
    return {
      category: 'no-vector',
      detail: `no vector yet (companion test gap: ${statement.testGap ?? 'unspecified'})`,
      cases,
    };
  }
  const dispositions = cases.map((c) => c.disposition);
  const pick = (d) => dispositions.includes(d);
  if (pick('fail')) return { category: 'fail', detail: 'at least one wired vector failed', cases };
  // A partial run must never claim statement-level pass: a filtered-out
  // sibling vector means the statement was not fully exercised (a FAIL above
  // still dominates — filtering must not mask a real failure either).
  if (pick('skip-filtered')) {
    return {
      category: 'untested-filtered',
      detail: 'wired vectors excluded by the case filter (partial run — not a full report)',
      cases,
    };
  }
  if (pick('pass')) return { category: 'pass', detail: 'all executed wired vectors passed', cases };
  if (pick('error-setup')) {
    return { category: 'untested-setup-error', detail: 'state realisation failed on this target', cases };
  }
  if (pick('skip-unrealizable-state') || pick('skip-unrealizable-agent') || pick('missing')) {
    return {
      category: 'untested-unrealizable',
      detail: 'declared state/agents not realisable black-box on this target',
      cases,
    };
  }
  if (pick('skip-precondition')) {
    return {
      category: 'untested-precondition',
      detail: 'optional feature not provided by the target — skipping is conformant',
      cases,
    };
  }
  return {
    category: 'untested-library',
    detail: 'wired vectors are library-level operations (bind them in-process to test this statement)',
    cases,
  };
}

/** Aggregate a full run: statements[] + per-case results -> report rows + summary. */
export function aggregate(statements, caseResults) {
  const rows = statements.map((s) => {
    const { category, detail, cases } = classifyStatement(s, caseResults);
    return { ...s, category, categoryDetail: detail, caseResults: cases };
  });

  const summary = {
    statements: { total: rows.length, bySpec: {}, byCategory: {}, byTestability: {} },
    headline: {},
  };
  for (const r of rows) {
    summary.statements.bySpec[r.spec] = (summary.statements.bySpec[r.spec] ?? 0) + 1;
    summary.statements.byCategory[r.category] = (summary.statements.byCategory[r.category] ?? 0) + 1;
    summary.statements.byTestability[r.testability] = (summary.statements.byTestability[r.testability] ?? 0) + 1;
  }

  for (const level of ['MUST', 'MUST NOT', 'SHOULD', 'SHOULD NOT', 'MAY']) {
    const executed = rows.filter((r) => r.level === level && (r.category === 'pass' || r.category === 'fail'));
    summary.headline[level] = {
      executed: executed.length,
      pass: executed.filter((r) => r.category === 'pass').length,
      fail: executed.filter((r) => r.category === 'fail').length,
    };
  }

  return { rows, summary };
}
