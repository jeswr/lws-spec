// AUTHORED-BY Claude Fable 5
// Suite: metadata — RFC 9264 linkset resources, merge-patch updates, the
// strict If-Match/428 discipline, system-managed vs user-managed categories
// (core#metadata, #metadata-categories, #metadata-updates).

export default function metadata(ctx) {
  const { STORAGE, CORE, PROBLEMS } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;

  const baseState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: 'alpha' },
    },
  };

  // Every case discovers the linkset URI from the resource's rel="linkset"
  // link — linkset URIs are server-chosen, never constructed by clients.
  const discover = {
    request: { method: 'GET', target: A },
    expected: {
      status: 200,
      headers: { Link: { includesLinkRel: { rel: 'linkset' } } },
    },
  };

  return {
    suite: 'metadata',
    spec: CORE,
    description:
      'Linkset metadata resources per RFC 9264: discovery via rel="linkset", '
      + 'application/linkset+json availability with ETags, REQUIRED JSON '
      + 'merge-patch support advertised in Accept-Patch, the 428/412 strict '
      + 'precondition discipline, immutability of system-managed links, and '
      + 'linkset deletion alongside its resource.',
    cases: [
      {
        id: 'linkset-discoverable-and-served',
        title: 'the linkset is discoverable via Link rel="linkset" and served as application/linkset+json with an ETag',
        clauses: ['core#metadata'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: {
              method: 'GET',
              target: '${response[0].link(linkset)}',
              headers: { Accept: 'application/linkset+json' },
            },
            expected: {
              status: 200,
              headers: {
                'Content-Type': { mediaType: 'application/linkset+json' },
                ETag: { present: true },
              },
              body: { jsonHasMembers: ['linkset'] },
            },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'linkset-advertises-accept-patch',
        title: 'linkset responses advertise application/merge-patch+json via Accept-Patch',
        clauses: ['core#metadata-updates'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: { method: 'GET', target: '${response[0].link(linkset)}' },
            expected: {
              status: 200,
              headers: { 'Accept-Patch': { includesToken: 'application/merge-patch+json' } },
            },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'linkset-merge-patch-updates-user-links',
        title: 'a conditional merge patch adds a user-managed link and rotates the linkset ETag',
        clauses: ['core#metadata-updates', 'core#metadata-categories'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: { method: 'GET', target: '${response[0].link(linkset)}' },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: {
              method: 'PATCH',
              target: '${response[0].link(linkset)}',
              headers: {
                'Content-Type': 'application/merge-patch+json',
                'If-Match': '${response[1].header.ETag}',
              },
              body: JSON.stringify({
                linkset: [{
                  anchor: A,
                  describedby: [{ href: `${NOTES}a-meta.ttl` }],
                }],
              }),
            },
            expected: { statusOneOf: [200, 204] },
          },
          {
            request: { method: 'GET', target: '${response[0].link(linkset)}' },
            expected: {
              status: 200,
              body: {
                jsonContains: {
                  linkset: [{ anchor: A, describedby: [{ href: `${NOTES}a-meta.ttl` }] }],
                },
              },
            },
          },
        ],
        input: { state: baseState },
        expected: {
          asserts: [
            { kind: 'differ', refs: ['response[1].header.ETag', 'response[3].header.ETag'] },
          ],
        },
      },
      {
        id: 'linkset-patch-without-if-match-428',
        title: 'PATCH on a linkset without If-Match is rejected 428 Precondition Required',
        clauses: ['core#metadata-updates'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: {
              method: 'PATCH',
              target: '${response[0].link(linkset)}',
              headers: { 'Content-Type': 'application/merge-patch+json' },
              body: JSON.stringify({
                linkset: [{ anchor: A, describedby: [{ href: `${NOTES}a-meta.ttl` }] }],
              }),
            },
            expected: { status: 428 },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'linkset-patch-stale-if-match-412',
        title: 'PATCH on a linkset with a stale If-Match is rejected 412 Precondition Failed',
        clauses: ['core#metadata-updates'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: {
              method: 'PATCH',
              target: '${response[0].link(linkset)}',
              headers: {
                'Content-Type': 'application/merge-patch+json',
                'If-Match': '"jlws-vectors-stale-0000"',
              },
              body: JSON.stringify({
                linkset: [{ anchor: A, describedby: [{ href: `${NOTES}a-meta.ttl` }] }],
              }),
            },
            expected: { status: 412 },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'system-managed-links-immutable',
        title: 'attempts to modify system-managed links (up, items) are rejected with problem type system-managed-metadata',
        clauses: ['core#metadata-categories', 'core#metadata-updates', 'core#containment'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: { method: 'GET', target: '${response[0].link(linkset)}' },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: {
              method: 'PATCH',
              target: '${response[0].link(linkset)}',
              headers: {
                'Content-Type': 'application/merge-patch+json',
                'If-Match': '${response[1].header.ETag}',
              },
              body: JSON.stringify({
                linkset: [{
                  anchor: A,
                  up: [{ href: `${STORAGE}elsewhere/` }],
                }],
              }),
            },
            expected: {
              statusClass: '4xx',
              problem: { type: `${PROBLEMS}system-managed-metadata` },
            },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'delete-removes-linkset',
        title: "deleting a resource deletes its linkset resource",
        clauses: ['core#metadata'],
        operation: 'http-exchange',
        exchanges: [
          discover,
          {
            request: { method: 'DELETE', target: A },
            expected: { status: 204 },
          },
          {
            request: { method: 'GET', target: '${response[0].link(linkset)}' },
            expected: { status: 404 },
          },
        ],
        input: { state: baseState },
      },
    ],
  };
}
