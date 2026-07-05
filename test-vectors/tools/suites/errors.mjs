// AUTHORED-BY Claude Fable 5
// Suite: errors — the RFC 9457 problem-details error contract and the
// oracle-freedom rules: 404-for-no-access, indistinguishability of hidden and
// missing resources, 403 only with partial access
// (core#http-general, #oracle-freedom, #rs-validation).

export default function errors(ctx) {
  const { STORAGE, CORE, BOB } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;
  const SECRET = `${NOTES}secret.txt`;

  const state = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: 'alpha' },
      [SECRET]: { type: 'DataResource', mediaType: 'text/plain', content: 'hidden from bob' },
    },
    access: { [BOB]: { [NOTES]: ['read'], [A]: ['read'] } },
  };

  return {
    suite: 'errors',
    spec: CORE,
    description:
      'The error contract: every 4xx/5xx carries an RFC 9457 problem-details '
      + 'body; agents with no access draw 404 (existence hidden); a resource '
      + 'the agent cannot see is indistinguishable from a missing one; 403 is '
      + 'reserved for agents with partial access.',
    cases: [
      {
        id: 'problem-details-on-4xx',
        title: 'every 4xx response carries an RFC 9457 application/problem+json body',
        clauses: ['core#http-general'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}missing.txt` },
            expected: {
              status: 404,
              headers: { 'Content-Type': { mediaType: 'application/problem+json' } },
              body: { jsonIsObject: true },
            },
          },
          {
            request: {
              method: 'PUT',
              target: A,
              headers: { 'Content-Type': 'text/plain' },
              body: 'unconditional',
            },
            expected: {
              status: 428,
              headers: { 'Content-Type': { mediaType: 'application/problem+json' } },
              body: { jsonIsObject: true },
            },
          },
        ],
        input: { state },
      },
      {
        id: 'no-access-hidden-as-404',
        title: 'an agent with no permitted operation on a resource SHOULD draw 404, not 403',
        clauses: ['core#oracle-freedom', 'core#rs-validation'],
        level: 'SHOULD',
        operation: 'http-exchange',
        input: {
          state,
          request: { method: 'GET', target: SECRET, agent: BOB },
        },
        expected: { status: 404 },
      },
      {
        id: 'hidden-indistinguishable-from-missing',
        title: 'error responses MUST NOT leak existence: a hidden resource answers exactly like a missing one (status and problem type)',
        clauses: ['core#oracle-freedom'],
        operation: 'http-exchange',
        notes: 'Operationalisation: whatever status/problem-type the server uses for '
          + 'a genuinely missing resource, the response for an existing-but-'
          + 'inaccessible one must be indistinguishable in status and problem type.',
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}genuinely-missing.txt`, agent: BOB },
            expected: { statusClass: '4xx' },
          },
          {
            request: { method: 'GET', target: SECRET, agent: BOB },
            expected: { statusClass: '4xx' },
          },
        ],
        input: { state },
        expected: {
          asserts: [
            { kind: 'equal', refs: ['response[0].status', 'response[1].status'] },
            { kind: 'equal', refs: ['response[0].problem.type', 'response[1].problem.type'] },
          ],
        },
      },
      {
        id: 'partial-access-403',
        title: 'a valid agent with SOME access to the resource but not the requested operation draws 403',
        clauses: ['core#rs-validation'],
        operation: 'http-exchange',
        input: {
          state,
          request: { method: 'DELETE', target: A, agent: BOB },
        },
        expected: {
          status: 403,
          stateAfter: { exists: [A] },
        },
      },
    ],
  };
}
