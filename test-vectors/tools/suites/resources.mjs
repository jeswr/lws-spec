// AUTHORED-BY Claude Fable 5
// Suite: resources — byte-native data-resource CRUD over the HTTP binding
// (core#http-create-put, #http-read, #http-update, #http-general).

export default function resources(ctx) {
  const { STORAGE, CORE, PROBLEMS, BOB } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

  const baseState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: ALPHABET },
    },
  };

  return {
    suite: 'resources',
    spec: CORE,
    description:
      'Byte-native data-resource semantics over the HTTP binding: idempotent '
      + 'PUT + If-None-Match: * creation, the strict 428/412 conditional-write '
      + 'discipline, byte-exact and media-type round-trips, Range, conditional '
      + 'GET, HEAD, the mandatory response links, path-traversal rejection, and '
      + 'quota exhaustion.',
    cases: [
      {
        id: 'put-create-if-none-match',
        title: 'PUT + If-None-Match: * to a fresh URI under an existing parent creates the resource (201)',
        clauses: ['core#http-create-put'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'PUT',
            target: `${NOTES}new.txt`,
            headers: { 'If-None-Match': '*', 'Content-Type': 'text/plain' },
            body: 'hello',
          },
        },
        expected: {
          status: 201,
          headers: {
            Link: { includesLinkRel: { rel: 'up', target: NOTES } },
          },
          stateAfter: { exists: [`${NOTES}new.txt`] },
        },
      },
      {
        id: 'put-create-existing-412',
        title: 'PUT + If-None-Match: * to an existing resource fails 412 and MUST NOT modify it',
        clauses: ['core#http-create-put'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'PUT',
            target: A,
            headers: { 'If-None-Match': '*', 'Content-Type': 'text/plain' },
            body: 'overwrite attempt',
          },
        },
        expected: {
          status: 412,
          stateAfter: { bytesUnchanged: [A] },
        },
      },
      {
        id: 'put-unconditional-existing-428',
        title: 'unconditional PUT to an existing resource is rejected 428 Precondition Required',
        clauses: ['core#http-update'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'PUT',
            target: A,
            headers: { 'Content-Type': 'text/plain' },
            body: 'unconditional overwrite',
          },
        },
        expected: {
          status: 428,
          stateAfter: { bytesUnchanged: [A] },
        },
      },
      {
        id: 'put-unconditional-nonexistent-428',
        title: 'unconditional PUT to a non-existent URI is never a create: 428, nothing created',
        clauses: ['core#http-create-put'],
        operation: 'http-exchange',
        notes: 'Every PUT in JLWS is explicitly conditional: an unconditional PUT '
          + 'whose target does not exist MUST yield 428 rather than create.',
        input: {
          state: baseState,
          request: {
            method: 'PUT',
            target: `${NOTES}never-created.txt`,
            headers: { 'Content-Type': 'text/plain' },
            body: 'should not be created',
          },
        },
        expected: {
          status: 428,
          stateAfter: { notExists: [`${NOTES}never-created.txt`] },
        },
      },
      {
        id: 'put-create-missing-parent-409',
        title: 'PUT-create under a missing parent container: 409 with problem type missing-parent (no auto-created intermediates)',
        clauses: ['core#http-create-put'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'PUT',
            target: `${STORAGE}no-such-dir/new.txt`,
            headers: { 'If-None-Match': '*', 'Content-Type': 'text/plain' },
            body: 'x',
          },
        },
        expected: {
          status: 409,
          problem: { type: `${PROBLEMS}missing-parent` },
          stateAfter: { notExists: [`${STORAGE}no-such-dir/`, `${STORAGE}no-such-dir/new.txt`] },
        },
      },
      {
        id: 'put-create-container-trailing-slash',
        title: 'PUT + If-None-Match: * to a URI ending in "/" with an empty body creates a container',
        clauses: ['core#http-create-put', 'core#path-alignment'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: {
              method: 'PUT',
              target: `${STORAGE}newdir/`,
              headers: { 'If-None-Match': '*' },
            },
            expected: { status: 201 },
          },
          {
            request: { method: 'GET', target: `${STORAGE}newdir/` },
            expected: {
              status: 200,
              body: { jsonContains: { type: 'Container', totalItems: 0 } },
            },
          },
        ],
        input: { state: baseState },
        expected: { stateAfter: { exists: [`${STORAGE}newdir/`] } },
      },
      {
        id: 'byte-exact-roundtrip',
        title: 'written bytes (including non-UTF-8 binary) and the full stored media type round-trip exactly',
        clauses: ['core#http-read', 'core#resource-classes'],
        operation: 'http-exchange',
        notes: 'The server stores and returns the representation without interpreting it: '
          + 'GET returns the stored bytes with the stored media type.',
        exchanges: [
          {
            request: {
              method: 'PUT',
              target: `${NOTES}blob.bin`,
              headers: { 'If-None-Match': '*', 'Content-Type': 'application/x.jlws-test+octets' },
              bodyBase64: 'AP8QIjNEVWZ3iJmqu8zd7g==',
            },
            expected: { status: 201 },
          },
          {
            request: { method: 'GET', target: `${NOTES}blob.bin` },
            expected: {
              status: 200,
              headers: { 'Content-Type': { mediaType: 'application/x.jlws-test+octets' }, ETag: { present: true } },
              body: { byteEqualsBase64: 'AP8QIjNEVWZ3iJmqu8zd7g==' },
            },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'range-request-206',
        title: 'Range: bytes=0-4 yields 206 with exactly the requested slice and Content-Range',
        clauses: ['core#http-read'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: {
            method: 'GET',
            target: A,
            headers: { Range: 'bytes=0-4' },
          },
        },
        expected: {
          status: 206,
          headers: { 'Content-Range': { equals: 'bytes 0-4/26' } },
          body: { byteEquals: 'abcde' },
        },
      },
      {
        id: 'range-unsatisfiable-416',
        title: 'a Range entirely beyond the representation length yields 416',
        clauses: ['core#http-read'],
        operation: 'http-exchange',
        notes: 'Range support is a MUST (RFC 9110 §14 via core#http-read); an '
          + 'unsatisfiable byte range yields 416 per RFC 9110 §15.5.17.',
        input: {
          state: baseState,
          request: {
            method: 'GET',
            target: A,
            headers: { Range: 'bytes=100-200' },
          },
        },
        expected: { status: 416 },
      },
      {
        id: 'conditional-get-if-none-match-304',
        title: 'GET with If-None-Match of the current ETag yields 304 Not Modified',
        clauses: ['core#http-read'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: A },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: {
              method: 'GET',
              target: A,
              headers: { 'If-None-Match': '${response[0].header.ETag}' },
            },
            expected: { status: 304, body: { empty: true } },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'conditional-get-if-modified-since-304',
        title: 'GET with If-Modified-Since later than the modification time yields 304',
        clauses: ['core#http-read'],
        operation: 'http-exchange',
        input: {
          state: {
            ...baseState,
            resources: {
              ...baseState.resources,
              [A]: {
                type: 'DataResource',
                mediaType: 'text/plain',
                content: ALPHABET,
                modified: '2026-06-20T09:00:00Z',
              },
            },
          },
          request: {
            method: 'GET',
            target: A,
            headers: { 'If-Modified-Since': 'Wed, 01 Jul 2026 00:00:00 GMT' },
          },
        },
        expected: { status: 304 },
      },
      {
        id: 'head-mirrors-get',
        title: "HEAD returns GET's status and headers without a body",
        clauses: ['core#http-read'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: A },
            expected: { status: 200 },
          },
          {
            request: { method: 'HEAD', target: A },
            expected: {
              status: 200,
              headers: { ETag: { present: true } },
              body: { empty: true },
            },
          },
        ],
        input: { state: baseState },
        expected: {
          asserts: [
            { kind: 'equal', refs: ['response[0].header.ETag', 'response[1].header.ETag'] },
          ],
        },
      },
      {
        id: 'required-links-on-get',
        title: 'every GET response carries ETag plus the linkset, up, type, and storage-description links',
        clauses: ['core#http-general', 'core#discovery-binding', 'core#containment'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: { method: 'GET', target: A },
        },
        expected: {
          status: 200,
          headers: {
            ETag: { present: true },
            Link: {
              includesLinkRelAll: [
                { rel: 'linkset' },
                { rel: 'up', target: NOTES },
                { rel: 'type' },
                {
                  relOneOf: [
                    'https://w3id.org/jeswr/lws#storageDescription',
                    'https://www.w3.org/ns/lws#storageDescription',
                  ],
                },
              ],
            },
          },
        },
      },
      {
        id: 'path-traversal-rejected',
        title: 'request targets containing encoded path-traversal sequences are rejected',
        clauses: ['core#http-general'],
        operation: 'http-exchange',
        notes: 'The spec additionally requires the rejection to happen BEFORE any '
          + 'authorization matching; that ordering is not black-box observable and is '
          + 'recorded in GAPS.md. The vector pins the observable half: the request '
          + 'never succeeds.',
        input: {
          state: baseState,
          request: {
            method: 'GET',
            target: `${NOTES}%2e%2e/%2e%2e/other-storage/secret.txt`,
          },
        },
        expected: { statusClass: '4xx' },
      },
      {
        id: 'quota-exhaustion-507',
        title: 'storage-quota exhaustion is reported as 507 Insufficient Storage',
        clauses: ['core#http-general'],
        operation: 'http-exchange',
        preconditions: { features: ['storage-quota'] },
        input: {
          state: { ...baseState, quotaRemainingBytes: 0 },
          request: {
            method: 'PUT',
            target: `${NOTES}big.txt`,
            headers: { 'If-None-Match': '*', 'Content-Type': 'text/plain' },
            body: 'this write exceeds the remaining quota',
          },
        },
        expected: {
          status: 507,
          stateAfter: { notExists: [`${NOTES}big.txt`] },
        },
      },
      {
        id: 'error-carries-problem-details',
        title: 'a 4xx response carries an RFC 9457 problem-details body (application/problem+json)',
        clauses: ['core#http-general'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: { method: 'GET', target: `${NOTES}does-not-exist.txt` },
        },
        expected: {
          status: 404,
          headers: { 'Content-Type': { mediaType: 'application/problem+json' } },
          body: { jsonIsObject: true },
        },
      },
      {
        id: 'agent-authenticated-via-bob',
        title: 'an authenticated agent with read access reads; the same agent gets no write without a write grant',
        clauses: ['core#rs-validation', 'core#oracle-freedom'],
        operation: 'http-exchange',
        notes: 'Establishes the state.access seam every authorization-sensitive case '
          + 'builds on: bob holds read (only) on a.txt. The write attempt draws 403 '
          + '(agent has SOME access to the resource, so existence is not hidden).',
        exchanges: [
          {
            request: { method: 'GET', target: A, agent: BOB },
            expected: { status: 200, body: { byteEquals: ALPHABET } },
          },
          {
            request: {
              method: 'PUT',
              target: A,
              agent: BOB,
              headers: { 'If-Match': '${response[0].header.ETag}', 'Content-Type': 'text/plain' },
              body: 'bob tries to write',
            },
            expected: { status: 403, },
          },
        ],
        input: {
          state: {
            ...baseState,
            access: { [BOB]: { [A]: ['read'] } },
          },
        },
        expected: { stateAfter: { bytesUnchanged: [A] } },
      },
    ],
  };
}
