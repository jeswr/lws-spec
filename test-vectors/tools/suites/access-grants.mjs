// AUTHORED-BY Claude Fable 5
// Suite: access-grants — the strict ODRL access profile: document validation
// (REQUIRED profile, singular action/target per rule) and default-deny grant
// evaluation with one-directional action inclusion, typed target matchers,
// conjunctive constraints, and the public assignee
// (core#odrl-profile, #access-requests-grants, #grants-are-records).

export default function accessGrants(ctx) {
  const { STORAGE, CORE, ALICE, BOB, NOW } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;
  const PROFILE = 'https://w3id.org/jeswr/lws/access-profile/odrl-1';
  const CONTEXT = ['http://www.w3.org/ns/odrl.jsonld', 'https://w3id.org/jeswr/lws/v1'];

  const grant = (permission, uid = `${STORAGE}.grants/vec-1`) => ({
    '@context': CONTEXT,
    '@type': 'Offer',
    uid,
    profile: PROFILE,
    assigner: ALICE,
    permission,
  });

  const readGrantOnA = grant([{
    assignee: BOB,
    action: 'read',
    target: { '@type': 'DataResource', uid: A },
  }]);

  const evalRequest = (action, target = A, over = {}) => ({
    agent: BOB,
    action,
    target,
    context: { dateTime: NOW },
    ...over,
  });

  return {
    suite: 'access-grants',
    spec: CORE,
    description:
      'The ODRL Access Requests & Grants interface: conforming-document '
      + 'validation (REQUIRED profile declaration, odrl:Request/odrl:Offer, '
      + 'exactly one action and one target per rule) and default-deny grant '
      + 'evaluation — a permitting grant, a denied request, one-directional '
      + 'jlws:create/jlws:append ⊑ odrl:modify inclusion, unknown-action '
      + 'fail-closed, recursive vs non-recursive Container targets, '
      + 'conjunctive purpose/dateTime constraints, and the foaf:Agent public '
      + 'assignee.',
    cases: [
      // ------------------------------------------------------------------
      // Document validation (core#odrl-profile)
      // ------------------------------------------------------------------
      {
        id: 'grant-document-valid',
        title: 'a conforming access grant (odrl:Offer with profile, singular rules, typed target, constraints) validates',
        clauses: ['core#odrl-profile'],
        operation: 'validate-access-document',
        input: {
          document: grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'Container', uid: NOTES, recursive: true },
            constraint: [
              { leftOperand: 'purpose', operator: 'eq', rightOperand: 'https://purpose.example/collaboration' },
              {
                leftOperand: 'dateTime',
                operator: 'lt',
                rightOperand: { '@value': '2026-12-31T00:00:00Z', '@type': 'xsd:dateTime' },
              },
            ],
          }], `${STORAGE}.grants/2f6c`),
        },
        expected: { ok: true, documentClass: 'grant' },
      },
      {
        id: 'request-document-valid',
        title: 'a conforming access request (odrl:Request) validates',
        clauses: ['core#odrl-profile'],
        operation: 'validate-access-document',
        input: {
          document: {
            '@context': CONTEXT,
            '@type': 'Request',
            uid: 'https://app.example/requests/77',
            profile: PROFILE,
            permission: [{
              assignee: BOB,
              action: 'read',
              target: { '@type': 'DataResource', uid: A },
            }],
          },
        },
        expected: { ok: true, documentClass: 'request' },
      },
      {
        id: 'document-missing-profile-rejected',
        title: 'an unprofiled ODRL document is not a conforming access document (profile is REQUIRED)',
        clauses: ['core#odrl-profile'],
        operation: 'validate-access-document',
        input: {
          document: {
            '@context': CONTEXT,
            '@type': 'Offer',
            uid: `${STORAGE}.grants/vec-2`,
            assigner: ALICE,
            permission: [{
              assignee: BOB,
              action: 'read',
              target: { '@type': 'DataResource', uid: A },
            }],
          },
        },
        expected: { ok: false, errorCode: 'PROFILE_MISSING' },
      },
      {
        id: 'document-multi-action-rule-rejected',
        title: 'a rule with more than one action is rejected (compose multiple rules instead)',
        clauses: ['core#odrl-profile'],
        operation: 'validate-access-document',
        input: {
          document: grant([{
            assignee: BOB,
            action: ['read', 'modify'],
            target: { '@type': 'DataResource', uid: A },
          }]),
        },
        expected: { ok: false, errorCode: 'ACTION_NOT_SINGULAR' },
      },
      {
        id: 'document-multi-target-rule-rejected',
        title: 'a rule with more than one target is rejected',
        clauses: ['core#odrl-profile'],
        operation: 'validate-access-document',
        input: {
          document: grant([{
            assignee: BOB,
            action: 'read',
            target: [
              { '@type': 'DataResource', uid: A },
              { '@type': 'Container', uid: NOTES },
            ],
          }]),
        },
        expected: { ok: false, errorCode: 'TARGET_NOT_SINGULAR' },
      },
      // ------------------------------------------------------------------
      // Grant evaluation (default deny; core#odrl-profile,
      // #grants-are-records)
      // ------------------------------------------------------------------
      {
        id: 'grant-permits-read',
        title: 'a read grant on a data resource permits the assignee to read it',
        clauses: ['core#odrl-profile', 'core#grants-are-records'],
        operation: 'evaluate-access',
        input: { grants: [readGrantOnA], request: evalRequest('read') },
        expected: { decision: 'permit' },
      },
      {
        id: 'request-denied-without-grant',
        title: 'an action no grant covers is denied (default deny): delete requested, only read granted',
        clauses: ['core#odrl-profile', 'core#oracle-freedom'],
        operation: 'evaluate-access',
        input: { grants: [readGrantOnA], request: evalRequest('delete') },
        expected: { decision: 'deny' },
      },
      {
        id: 'modify-includes-create',
        title: 'a grant of odrl:modify also permits the narrower jlws:create',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'modify',
            target: { '@type': 'Container', uid: NOTES, recursive: true },
          }])],
          request: evalRequest('create', `${NOTES}new.txt`),
        },
        expected: { decision: 'permit' },
      },
      {
        id: 'create-only-not-widened-to-modify',
        title: 'inclusion is one-directional: a create-only grant MUST NOT be widened to modify',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'https://w3id.org/jeswr/lws#create',
            target: { '@type': 'Container', uid: NOTES, recursive: true },
          }])],
          request: evalRequest('modify', A),
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'unknown-action-fail-closed',
        title: 'a rule granting an action the enforcement layer does not understand grants nothing (fail closed)',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'https://extension.example/administer',
            target: { '@type': 'DataResource', uid: A },
          }])],
          request: evalRequest('https://extension.example/administer'),
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'container-recursive-covers-descendant',
        title: 'a Container target with jlws:recursive true covers the container and its descendants',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'Container', uid: NOTES, recursive: true },
          }])],
          request: evalRequest('read', `${NOTES}deep/nested/file.txt`),
        },
        expected: { decision: 'permit' },
      },
      {
        id: 'container-nonrecursive-excludes-descendant',
        title: 'a Container target without recursive covers only the container itself, not descendants',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'Container', uid: NOTES },
          }])],
          request: evalRequest('read', A),
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'constraints-conjunctive-satisfied',
        title: 'when multiple constraints are present, all satisfied → permit',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'DataResource', uid: A },
            constraint: [
              { leftOperand: 'purpose', operator: 'eq', rightOperand: 'https://purpose.example/collaboration' },
              {
                leftOperand: 'dateTime',
                operator: 'lt',
                rightOperand: { '@value': '2026-12-31T00:00:00Z', '@type': 'xsd:dateTime' },
              },
            ],
          }])],
          request: evalRequest('read', A, {
            context: { purpose: 'https://purpose.example/collaboration', dateTime: NOW },
          }),
        },
        expected: { decision: 'permit' },
      },
      {
        id: 'constraint-purpose-mismatch-denied',
        title: 'a purpose constraint not matched by the request context denies',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'DataResource', uid: A },
            constraint: [
              { leftOperand: 'purpose', operator: 'eq', rightOperand: 'https://purpose.example/collaboration' },
            ],
          }])],
          request: evalRequest('read', A, {
            context: { purpose: 'https://purpose.example/advertising', dateTime: NOW },
          }),
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'constraint-datetime-expired-denied',
        title: 'a dateTime upper-bound constraint in the past denies (expired grant)',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'DataResource', uid: A },
            constraint: [{
              leftOperand: 'dateTime',
              operator: 'lt',
              rightOperand: { '@value': '2026-06-01T00:00:00Z', '@type': 'xsd:dateTime' },
            }],
          }])],
          request: evalRequest('read'),
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'public-assignee-foaf-agent',
        title: 'public access is expressed with the foaf:Agent assignee: any agent is permitted',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: 'http://xmlns.com/foaf/0.1/Agent',
            action: 'read',
            target: { '@type': 'DataResource', uid: A },
          }])],
          request: evalRequest('read', A, { agent: 'https://id.example/carol' }),
        },
        expected: { decision: 'permit' },
      },
      {
        id: 'storage-resource-target-covers-storage',
        title: 'a StorageResource target covers every resource in the storage',
        clauses: ['core#odrl-profile'],
        operation: 'evaluate-access',
        input: {
          grants: [grant([{
            assignee: BOB,
            action: 'read',
            target: { '@type': 'StorageResource', uid: STORAGE },
          }])],
          request: evalRequest('read', `${STORAGE}anywhere/deep.txt`),
        },
        expected: { decision: 'permit' },
      },
    ],
  };
}
