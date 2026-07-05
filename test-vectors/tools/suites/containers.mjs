// AUTHORED-BY Claude Fable 5
// Suite: containers — container representation, containment metadata,
// creation, deletion, fail-closed listings, strict container/data separation
// (core#container-representation, #containment, #container-vs-data,
// #membership-authorization, #http-create-post, #http-delete, #http-move).

export default function containers(ctx) {
  const { STORAGE, CORE, BOB } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;
  const B = `${NOTES}b.txt`;
  const ARCHIVE = `${NOTES}archive/`;

  const baseState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: {
        type: 'DataResource', mediaType: 'text/plain', content: 'alpha', modified: '2026-06-24T12:00:00Z',
      },
      [ARCHIVE]: { type: 'Container', modified: '2026-06-20T09:00:00Z' },
    },
  };

  const twoFileState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: 'alpha' },
      [B]: { type: 'DataResource', mediaType: 'text/plain', content: 'beta' },
    },
  };

  return {
    suite: 'containers',
    spec: CORE,
    description:
      'Container listings as server-managed JSON-LD (flat items, totalItems, '
      + 'member descriptions), identical-bytes content negotiation across the '
      + 'JSON media types, rel="up" containment links, POST/Slug creation with '
      + 'the namespace-alias rule, empty-vs-recursive DELETE with Depth: '
      + 'infinity, atomic membership maintenance, fail-closed listings, and the '
      + 'strict container-is-not-a-data-resource separation.',
    cases: [
      {
        id: 'listing-shape',
        title: 'GET on a container returns the server-managed JSON-LD listing (id, type, totalItems, items with member descriptions)',
        clauses: ['core#container-properties', 'core#container-media-type'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: { method: 'GET', target: NOTES },
        },
        expected: {
          status: 200,
          headers: { 'Content-Type': { mediaType: 'application/ld+json' }, ETag: { present: true } },
          body: {
            jsonContains: {
              id: NOTES,
              type: 'Container',
              totalItems: 2,
              items: [
                { id: A, type: 'DataResource', mediaType: 'text/plain' },
                { id: ARCHIVE, type: 'Container' },
              ],
            },
          },
        },
      },
      {
        id: 'listing-conneg-identical-bytes',
        title: 'the listing is served for application/lws+json, application/ld+json, and application/json with identical payload bytes',
        clauses: ['core#container-media-type'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: NOTES, headers: { Accept: 'application/lws+json' } },
            expected: { status: 200, headers: { 'Content-Type': { mediaType: 'application/lws+json' } } },
          },
          {
            request: { method: 'GET', target: NOTES, headers: { Accept: 'application/ld+json' } },
            expected: { status: 200, headers: { 'Content-Type': { mediaType: 'application/ld+json' } } },
          },
          {
            request: { method: 'GET', target: NOTES, headers: { Accept: 'application/json' } },
            expected: { status: 200, headers: { 'Content-Type': { mediaType: 'application/json' } } },
          },
        ],
        input: { state: baseState },
        expected: {
          asserts: [
            { kind: 'equal', refs: ['response[0].body', 'response[1].body', 'response[2].body'] },
          ],
        },
      },
      {
        id: 'rel-up-on-non-root',
        title: 'GET/HEAD on any non-root resource carries Link rel="up" to the parent container',
        clauses: ['core#containment'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: { method: 'GET', target: ARCHIVE },
        },
        expected: {
          status: 200,
          headers: { Link: { includesLinkRel: { rel: 'up', target: NOTES } } },
        },
      },
      {
        id: 'post-create-data-resource',
        title: 'POST to a container creates a data resource: 201, server-assigned path-aligned Location, retrievable content',
        clauses: ['core#http-create-post', 'core#path-alignment'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: {
              method: 'POST',
              target: NOTES,
              headers: { 'Content-Type': 'text/plain', Slug: 'fresh' },
              body: 'posted content',
            },
            expected: {
              status: 201,
              headers: {
                Location: { present: true, startsWith: NOTES },
                Link: { includesLinkRel: { rel: 'up', target: NOTES } },
              },
            },
          },
          {
            request: { method: 'GET', target: '${response[0].header.Location}' },
            expected: { status: 200, body: { byteEquals: 'posted content' } },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'post-create-container-typed-link',
        title: 'POST with Link rel="type" jlws#Container creates a container',
        clauses: ['core#http-create-post'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: {
              method: 'POST',
              target: NOTES,
              headers: {
                Link: '<https://w3id.org/jeswr/lws#Container>; rel="type"',
                Slug: 'subdir',
              },
            },
            expected: {
              status: 201,
              headers: { Location: { present: true, startsWith: NOTES } },
            },
          },
          {
            request: { method: 'GET', target: '${response[0].header.Location}' },
            expected: { status: 200, body: { jsonContains: { type: 'Container' } } },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'post-create-container-namespace-alias',
        title: 'the w3.org/ns/lws#Container alias URI MUST be accepted in the rel="type" creation link',
        clauses: ['core#namespace', 'core#http-create-post'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: {
              method: 'POST',
              target: NOTES,
              headers: {
                Link: '<https://www.w3.org/ns/lws#Container>; rel="type"',
                Slug: 'aliased',
              },
            },
            expected: { status: 201, headers: { Location: { present: true } } },
          },
          {
            request: { method: 'GET', target: '${response[0].header.Location}' },
            expected: { status: 200, body: { jsonContains: { type: 'Container' } } },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'post-to-missing-container-404',
        title: 'POST to a non-existent container responds 404',
        clauses: ['core#http-create-post'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'POST',
            target: `${STORAGE}no-such-container/`,
            headers: { 'Content-Type': 'text/plain' },
            body: 'x',
          },
        },
        expected: { status: 404 },
      },
      {
        id: 'post-slug-conflict',
        title: 'POST with a Slug colliding with an existing member: the server assigns a different URI or responds 409',
        clauses: ['core#http-create-post'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'POST',
            target: NOTES,
            headers: { 'Content-Type': 'text/plain', Slug: 'a.txt' },
            body: 'colliding create',
          },
        },
        expected: {
          anyOf: [
            {
              status: 201,
              headers: { Location: { present: true, notEquals: A } },
            },
            { status: 409 },
          ],
          stateAfter: { bytesUnchanged: [A] },
        },
      },
      {
        id: 'delete-nonempty-no-depth-409',
        title: 'DELETE on a non-empty container without recursion is rejected 409',
        clauses: ['core#http-delete'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: { method: 'DELETE', target: NOTES },
        },
        expected: {
          status: 409,
          stateAfter: { exists: [NOTES, A] },
        },
      },
      {
        id: 'delete-depth-infinity-recursive',
        title: 'a server advertising RecursiveDelete MUST honour DELETE with Depth: infinity, deleting the subtree',
        clauses: ['core#http-delete'],
        operation: 'http-exchange',
        preconditions: { capabilities: ['RecursiveDelete'] },
        input: {
          state: { ...baseState, capabilities: ['RecursiveDelete'] },
          request: {
            method: 'DELETE',
            target: NOTES,
            headers: { Depth: 'infinity' },
          },
        },
        expected: {
          status: 204,
          stateAfter: { notExists: [NOTES, A, ARCHIVE], exists: [STORAGE] },
        },
      },
      {
        id: 'delete-rotates-parent-etag-and-membership',
        title: "deleting a resource atomically removes it from the parent's items and changes the parent's ETag",
        clauses: ['core#http-delete', 'core#containment'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: NOTES },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: { method: 'DELETE', target: A },
            expected: { status: 204 },
          },
          {
            request: { method: 'GET', target: NOTES },
            expected: {
              status: 200,
              body: {
                jsonContains: { totalItems: 1 },
                jsonArrayExcludes: { path: 'items', subset: { id: A } },
              },
            },
          },
        ],
        input: { state: baseState },
        expected: {
          asserts: [
            { kind: 'differ', refs: ['response[0].header.ETag', 'response[2].header.ETag'] },
          ],
          stateAfter: { notExists: [A] },
        },
      },
      {
        id: 'listing-excludes-inaccessible-members',
        title: 'the listing MUST NOT include members the agent has no access to, and totalItems counts only the visible view',
        clauses: ['core#membership-authorization', 'core#oracle-freedom'],
        operation: 'http-exchange',
        input: {
          state: {
            ...twoFileState,
            access: { [BOB]: { [NOTES]: ['read'], [A]: ['read'] } },
          },
          request: { method: 'GET', target: NOTES, agent: BOB },
        },
        expected: {
          status: 200,
          body: {
            jsonContains: { totalItems: 1, items: [{ id: A }] },
            jsonArrayExcludes: { path: 'items', subset: { id: B } },
          },
        },
      },
      {
        id: 'put-content-to-container-rejected',
        title: 'client-authored content is never served as a container representation: content PUT to a container fails, the listing survives',
        clauses: ['core#container-vs-data'],
        operation: 'http-exchange',
        notes: 'The only representation of a container is the server-managed listing; '
          + 'a successful content PUT would (per RFC 9110) mean the enclosed '
          + 'representation replaced it, so the PUT cannot succeed.',
        exchanges: [
          {
            request: {
              method: 'PUT',
              target: ARCHIVE,
              headers: { 'Content-Type': 'text/turtle', 'If-Match': '*' },
              body: '<> a <https://w3id.org/jeswr/lws#Container> .',
            },
            expected: { statusClass: '4xx' },
          },
          {
            request: { method: 'GET', target: ARCHIVE },
            expected: {
              status: 200,
              headers: { 'Content-Type': { mediaType: 'application/ld+json' } },
              body: { jsonContains: { type: 'Container' } },
            },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'move-reparents-with-new-uri',
        title: 'move (optional): PATCHing the up link under the MoveResource capability reparents, reassigns a path-aligned URI, returns it in Location',
        clauses: ['core#http-move', 'core#metadata-categories'],
        operation: 'http-exchange',
        preconditions: { capabilities: ['MoveResource'] },
        notes: 'The up link is the ONE system-managed link writable through this '
          + 'operation, and only under this capability. The final path segment is '
          + 'preserved (no conflict in the destination).',
        exchanges: [
          {
            request: { method: 'GET', target: `${STORAGE}a/doc.txt` },
            expected: {
              status: 200,
              headers: { Link: { includesLinkRel: { rel: 'linkset' } } },
            },
          },
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
                  anchor: `${STORAGE}a/doc.txt`,
                  up: [{ href: `${STORAGE}b/` }],
                }],
              }),
            },
            expected: {
              status: 200,
              headers: { Location: { equals: `${STORAGE}b/doc.txt` } },
            },
          },
        ],
        input: {
          state: {
            storageRoot: STORAGE,
            capabilities: ['MoveResource'],
            resources: {
              [STORAGE]: { type: 'Container' },
              [`${STORAGE}a/`]: { type: 'Container' },
              [`${STORAGE}b/`]: { type: 'Container' },
              [`${STORAGE}a/doc.txt`]: { type: 'DataResource', mediaType: 'text/plain', content: 'movable' },
            },
          },
        },
        expected: {
          stateAfter: {
            exists: [`${STORAGE}b/doc.txt`],
            notExists: [`${STORAGE}a/doc.txt`],
          },
        },
      },
    ],
  };
}
