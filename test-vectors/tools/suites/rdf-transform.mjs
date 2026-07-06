// AUTHORED-BY Claude Fable 5
// Suite: rdf-transform — the opt-in RDF Content Transformation Profile:
// capability declaration consistency, RDF 1.1 abstract-syntax round-trips
// (graph isomorphism, no inference, resource-URI base), authoritative bytes
// with per-representation ETags and cross-representation If-Match, the
// normalizes flag, per-resource degradation on unparseable sources, the
// byte-native behaviour when the opt-in is OFF, and the advertisement
// contract (advertised pairs are served; clients feature-detect fail-closed;
// SparqlQueryService only when the profile is on) (rdf#capability,
// #round-trip, #authoritative-bytes, #normalizes, #rdf-patch, #indexing;
// core#content-transformation, #query-services).

export default function rdfTransform(ctx) {
  const { STORAGE, RDF1, CORE } = ctx;
  const NOTES = `${STORAGE}notes/`;

  const TTL_ENTRY = {
    type: 'ContentNegotiation',
    source: 'text/turtle',
    target: ['application/ld+json', 'application/n-triples'],
    profile: RDF1,
  };
  const JSONLD_ENTRY = {
    type: 'ContentNegotiation',
    source: 'application/ld+json',
    target: ['text/turtle', 'application/n-triples'],
    profile: RDF1,
  };

  const CARD_TTL = [
    '@prefix schema: <http://schema.org/> .',
    '',
    '# stored formatting and this comment are part of the authoritative bytes',
    '<https://storage.example/alice/notes/card.ttl#me>',
    '    a             schema:Person ;',
    '    schema:name   "Alice" ;',
    '    schema:knows  <https://id.example/bob> .',
    '',
  ].join('\n');

  const CARD_NQ = [
    '<https://storage.example/alice/notes/card.ttl#me> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
    '<https://storage.example/alice/notes/card.ttl#me> <http://schema.org/name> "Alice" .',
    '<https://storage.example/alice/notes/card.ttl#me> <http://schema.org/knows> <https://id.example/bob> .',
    '',
  ].join('\n');

  const rdfOnState = {
    storageRoot: STORAGE,
    capabilities: [TTL_ENTRY, JSONLD_ENTRY],
    conformsTo: [CORE, RDF1],
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [`${NOTES}card.ttl`]: { type: 'DataResource', mediaType: 'text/turtle', content: CARD_TTL },
    },
  };

  const rdfOffState = {
    storageRoot: STORAGE,
    capabilities: [],
    conformsTo: [CORE],
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [`${NOTES}card.ttl`]: { type: 'DataResource', mediaType: 'text/turtle', content: CARD_TTL },
    },
  };

  return {
    suite: 'rdf-transform',
    spec: RDF1,
    description:
      'The RDF Content Transformation Profile (the opt-in that makes a '
      + 'byte-native storage RDF-aware): capability/conformsTo consistency, '
      + 'graph-isomorphic source→target transformation with no inference and '
      + 'resource-URI base resolution, authoritative stored bytes with '
      + 'per-representation ETags + Vary: Accept + cross-representation '
      + 'If-Match, deterministic normalizes read-back, 406 degradation for '
      + 'unparseable sources, RDF PATCH formats scoped to the profile, and '
      + 'exact byte-native behaviour when the opt-in is off.',
    cases: [
      // ------------------------------------------------------------------
      // Capability declaration (rdf#capability)
      // ------------------------------------------------------------------
      {
        id: 'capability-requires-conformsto-profile',
        title: 'a storage description with a ContentNegotiation entry claiming rdf-1 MUST list the profile URI in conformsTo',
        clauses: ['rdf#capability'],
        operation: 'validate-storage-description',
        input: {
          document: {
            '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
            id: STORAGE,
            type: 'Storage',
            conformsTo: [CORE],
            capability: [TTL_ENTRY],
            service: [{ type: 'StorageDescription', serviceEndpoint: `${STORAGE}description` }],
          },
        },
        expected: { ok: false, errorCode: 'CONFORMS_TO_PROFILE_MISSING' },
      },
      {
        id: 'capability-entry-requires-source-and-target',
        title: 'a ContentNegotiation entry without REQUIRED source/target members is rejected',
        clauses: ['rdf#capability'],
        operation: 'validate-storage-description',
        input: {
          document: {
            '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
            id: STORAGE,
            type: 'Storage',
            conformsTo: [CORE, RDF1],
            capability: [{ type: 'ContentNegotiation', profile: RDF1 }],
            service: [{ type: 'StorageDescription', serviceEndpoint: `${STORAGE}description` }],
          },
        },
        expected: { ok: false, errorCode: 'CAPABILITY_MALFORMED' },
      },
      {
        id: 'advertised-conneg-honoured',
        title: 'a server advertising the rdf-1 pair actually serves the derived representation: Accept application/ld+json on stored Turtle yields JSON-LD with Vary: Accept',
        clauses: ['rdf#capability', 'rdf#round-trip', 'rdf#authoritative-bytes'],
        operation: 'http-exchange',
        notes: 'The advertisement contract on the wire: "servers MUST NOT '
          + 'advertise pairs they do not implement" (rdf#capability, the '
          + 'core conformance rule). The representation-stability half — the '
          + 'derived body encoding a graph isomorphic to the stored one — is '
          + 'pinned by the transform-representation cases '
          + '(turtle-to-jsonld-isomorphic and siblings); this case pins that '
          + 'the advertised pair is actually negotiable and varies by '
          + 'Accept.',
        input: {
          state: rdfOnState,
          request: {
            method: 'GET',
            target: `${NOTES}card.ttl`,
            headers: { Accept: 'application/ld+json' },
          },
        },
        expected: {
          status: 200,
          headers: {
            'Content-Type': { mediaType: 'application/ld+json' },
            Vary: { includesToken: 'Accept' },
          },
          body: { jsonIsObject: true },
        },
      },
      {
        id: 'client-detects-transform-offer',
        title: 'an RDF-aware client feature-detects the rdf-1 profile from the storage description: an advertised source→target pair with the profile URI and conformsTo entry is available',
        clauses: ['rdf#capability', 'rdf#conformance'],
        operation: 'evaluate-transform-offer',
        input: {
          storageDescription: {
            '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
            id: STORAGE,
            type: 'Storage',
            conformsTo: [CORE, RDF1],
            capability: [TTL_ENTRY],
            service: [{ type: 'StorageDescription', serviceEndpoint: `${STORAGE}description` }],
          },
          sourceMediaType: 'text/turtle',
          targetMediaType: 'application/ld+json',
        },
        expected: { available: true },
      },
      {
        id: 'client-fail-closed-no-advertisement',
        title: 'clients MUST NOT attempt transformation-dependent behaviour against a storage that does not advertise the profile — a profile-less ContentNegotiation entry makes no rdf-1 claim',
        clauses: ['rdf#capability'],
        operation: 'evaluate-transform-offer',
        notes: 'The trap: the document DOES carry a ContentNegotiation entry '
          + 'whose source/target cover the requested pair, but without the '
          + 'REQUIRED profile member it makes no semantics-preservation '
          + 'claim and is outside the rdf-1 contract (rdf#capability), and '
          + 'conformsTo does not list the profile URI. A client keying on '
          + 'source/target alone would wrongly rely on RDF conneg here.',
        input: {
          storageDescription: {
            '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
            id: STORAGE,
            type: 'Storage',
            conformsTo: [CORE],
            capability: [{
              type: 'ContentNegotiation',
              source: 'text/turtle',
              target: ['application/ld+json'],
            }],
            service: [{ type: 'StorageDescription', serviceEndpoint: `${STORAGE}description` }],
          },
          sourceMediaType: 'text/turtle',
          targetMediaType: 'application/ld+json',
        },
        expected: { available: false },
      },
      {
        id: 'sparql-service-requires-profile-on',
        title: 'a SparqlQueryService MUST only be advertised when the rdf-1 profile is on: advertising it without the profile is rejected',
        clauses: ['rdf#indexing', 'core#query-services'],
        operation: 'validate-storage-description',
        notes: 'rdf#indexing: "The SparqlQueryService MUST only be advertised '
          + 'when this profile is on" (SPARQL is meaningless over an opaque '
          + 'byte substrate). The document below advertises the service but '
          + 'neither an rdf-1 capability entry nor the profile URI in '
          + 'conformsTo. The full AC-SPARQL binding surface (gating '
          + 'behaviour, per-solution authorization filtering) is the planned '
          + 'ac-sparql suite, gated on its implementation '
          + '(docs/alignment/ac-sparql.md); this case pins only the '
          + 'discovery-consistency half.',
        input: {
          document: {
            '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
            id: STORAGE,
            type: 'Storage',
            conformsTo: [CORE],
            service: [
              { type: 'StorageDescription', serviceEndpoint: `${STORAGE}description` },
              { type: 'SparqlQueryService', serviceEndpoint: `${STORAGE}.query/sparql` },
            ],
          },
        },
        expected: { ok: false, errorCode: 'SERVICE_REQUIRES_PROFILE' },
      },
      // ------------------------------------------------------------------
      // Transformation semantics (rdf#round-trip)
      // ------------------------------------------------------------------
      {
        id: 'turtle-to-jsonld-isomorphic',
        title: 'text/turtle → application/ld+json preserves the RDF graph up to isomorphism',
        clauses: ['rdf#round-trip'],
        operation: 'transform-representation',
        input: {
          source: 'source.ttl',
          sourceMediaType: 'text/turtle',
          targetMediaType: 'application/ld+json',
          base: `${NOTES}card.ttl`,
        },
        expected: { ok: true, isomorphicTo: 'expected.nq' },
        files: { 'source.ttl': CARD_TTL, 'expected.nq': CARD_NQ },
      },
      {
        id: 'jsonld-to-turtle-isomorphic',
        title: 'application/ld+json → text/turtle preserves the RDF graph up to isomorphism',
        clauses: ['rdf#round-trip'],
        operation: 'transform-representation',
        input: {
          source: 'source.jsonld',
          sourceMediaType: 'application/ld+json',
          targetMediaType: 'text/turtle',
          base: `${NOTES}card.jsonld`,
        },
        expected: { ok: true, isomorphicTo: 'expected.nq' },
        files: {
          'source.jsonld': `${JSON.stringify({
            '@context': {
              name: 'http://schema.org/name',
              knows: { '@id': 'http://schema.org/knows', '@type': '@id' },
              Person: 'http://schema.org/Person',
            },
            '@id': 'https://storage.example/alice/notes/card.jsonld#me',
            '@type': 'Person',
            name: 'Alice',
            knows: 'https://id.example/bob',
          }, null, 2)}\n`,
          'expected.nq': [
            '<https://storage.example/alice/notes/card.jsonld#me> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/Person> .',
            '<https://storage.example/alice/notes/card.jsonld#me> <http://schema.org/name> "Alice" .',
            '<https://storage.example/alice/notes/card.jsonld#me> <http://schema.org/knows> <https://id.example/bob> .',
            '',
          ].join('\n'),
        },
      },
      {
        id: 'blank-node-isomorphism',
        title: 'blank nodes survive transformation up to relabelling (isomorphism, not identifier stability)',
        clauses: ['rdf#round-trip'],
        operation: 'transform-representation',
        input: {
          source: 'source.ttl',
          sourceMediaType: 'text/turtle',
          targetMediaType: 'application/n-triples',
          base: `${NOTES}addr.ttl`,
        },
        expected: { ok: true, isomorphicTo: 'expected.nq' },
        files: {
          'source.ttl': [
            '@prefix schema: <http://schema.org/> .',
            '<https://storage.example/alice/notes/addr.ttl#me> schema:address _:a .',
            '_:a schema:streetAddress "1 Example Way" ;',
            '    schema:addressLocality "Oxford" .',
            '',
          ].join('\n'),
          'expected.nq': [
            '<https://storage.example/alice/notes/addr.ttl#me> <http://schema.org/address> _:b0 .',
            '_:b0 <http://schema.org/streetAddress> "1 Example Way" .',
            '_:b0 <http://schema.org/addressLocality> "Oxford" .',
            '',
          ].join('\n'),
        },
      },
      {
        id: 'no-inference-applied',
        title: 'transformation adds and removes no triples: schema statements are NOT expanded',
        clauses: ['rdf#round-trip'],
        operation: 'transform-representation',
        notes: 'The source asserts ex:Dog rdfs:subClassOf ex:Animal and types rex as '
          + 'ex:Dog; the output graph must contain exactly those two triples — an '
          + 'inferred (rex a ex:Animal) triple would break isomorphism.',
        input: {
          source: 'source.ttl',
          sourceMediaType: 'text/turtle',
          targetMediaType: 'application/n-triples',
          base: `${NOTES}pets.ttl`,
        },
        expected: { ok: true, isomorphicTo: 'expected.nq' },
        files: {
          'source.ttl': [
            '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
            '@prefix ex: <https://vocab.example/> .',
            'ex:Dog rdfs:subClassOf ex:Animal .',
            '<https://storage.example/alice/notes/pets.ttl#rex> a ex:Dog .',
            '',
          ].join('\n'),
          'expected.nq': [
            '<https://vocab.example/Dog> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://vocab.example/Animal> .',
            '<https://storage.example/alice/notes/pets.ttl#rex> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://vocab.example/Dog> .',
            '',
          ].join('\n'),
        },
      },
      {
        id: 'remote-context-declined-not-fetched',
        title: 'a compacted JSON-LD source declaring a non-allowlisted remote @context MUST be declined — never resolved with a network fetch',
        clauses: ['rdf#round-trip', 'rdf#security-privacy'],
        operation: 'transform-representation',
        notes: 'A compacted source cannot be interpreted as an RDF graph without '
          + 'resolving its context, and a remote-context fetch on attacker-supplied '
          + 'content is an SSRF primitive: the server declines the transformation '
          + '(at the HTTP binding: 406 + problem details, as for an unparseable '
          + 'source). The no-fetch half is only fully observable with an '
          + 'instrumented network layer (GAPS.md); this vector pins the decline.',
        input: {
          source: 'source.jsonld',
          sourceMediaType: 'application/ld+json',
          targetMediaType: 'text/turtle',
          base: `${NOTES}remote-ctx.jsonld`,
          allowlistedContexts: [],
        },
        expected: { ok: false, errorCode: 'REMOTE_CONTEXT_DECLINED' },
        files: {
          'source.jsonld': `${JSON.stringify({
            '@context': 'https://untrusted-context.example/context.jsonld',
            '@id': 'https://storage.example/alice/notes/remote-ctx.jsonld#it',
            '@type': 'Thing',
            name: 'cannot be interpreted without fetching the context',
          }, null, 2)}\n`,
        },
      },
      {
        id: 'relative-iris-resolve-against-resource-uri',
        title: 'relative IRIs resolve against the resource URI as base, identically in every representation',
        clauses: ['rdf#round-trip'],
        operation: 'transform-representation',
        input: {
          source: 'source.ttl',
          sourceMediaType: 'text/turtle',
          targetMediaType: 'application/n-triples',
          base: `${NOTES}rel.ttl`,
        },
        expected: { ok: true, isomorphicTo: 'expected.nq' },
        files: {
          'source.ttl': [
            '@prefix schema: <http://schema.org/> .',
            '<> schema:name "notes about relative IRIs" .',
            '<#section-1> schema:isPartOf <> .',
            '<sibling.txt> schema:sameAs <./sibling.txt> .',
            '',
          ].join('\n'),
          'expected.nq': [
            '<https://storage.example/alice/notes/rel.ttl> <http://schema.org/name> "notes about relative IRIs" .',
            '<https://storage.example/alice/notes/rel.ttl#section-1> <http://schema.org/isPartOf> <https://storage.example/alice/notes/rel.ttl> .',
            '<https://storage.example/alice/notes/sibling.txt> <http://schema.org/sameAs> <https://storage.example/alice/notes/sibling.txt> .',
            '',
          ].join('\n'),
        },
      },
      // ------------------------------------------------------------------
      // Authoritative bytes, ETags, preconditions (rdf#authoritative-bytes)
      // ------------------------------------------------------------------
      {
        id: 'stored-bytes-byte-exact',
        title: 'reads in the stored media type return the stored bytes exactly (comments and formatting included) when normalizes is not declared',
        clauses: ['rdf#authoritative-bytes', 'rdf#normalizes'],
        operation: 'http-exchange',
        input: {
          state: rdfOnState,
          request: {
            method: 'GET',
            target: `${NOTES}card.ttl`,
            headers: { Accept: 'text/turtle' },
          },
        },
        expected: {
          status: 200,
          headers: { 'Content-Type': { mediaType: 'text/turtle' } },
          body: { byteEquals: CARD_TTL },
        },
      },
      {
        id: 'per-representation-etags-differ',
        title: 'the Turtle and JSON-LD representations of one resource state carry DIFFERENT ETags, and responses vary by Accept',
        clauses: ['rdf#authoritative-bytes'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'text/turtle' } },
            expected: {
              status: 200,
              headers: { ETag: { present: true }, Vary: { includesToken: 'Accept' } },
            },
          },
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'application/ld+json' } },
            expected: {
              status: 200,
              headers: {
                ETag: { present: true },
                'Content-Type': { mediaType: 'application/ld+json' },
                Vary: { includesToken: 'Accept' },
              },
            },
          },
        ],
        input: { state: rdfOnState },
        expected: {
          asserts: [
            { kind: 'differ', refs: ['response[0].header.ETag', 'response[1].header.ETag'] },
          ],
        },
      },
      {
        id: 'if-match-derived-etag-accepted',
        title: "a write conditioned on the DERIVED representation's current ETag is accepted (both ETags name the same resource state)",
        clauses: ['rdf#authoritative-bytes'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'application/ld+json' } },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: {
              method: 'PUT',
              target: `${NOTES}card.ttl`,
              headers: {
                'Content-Type': 'text/turtle',
                'If-Match': '${response[0].header.ETag}',
              },
              body: '<https://storage.example/alice/notes/card.ttl#me> <http://schema.org/name> "Alice v2" .\n',
            },
            expected: { statusOneOf: [200, 204] },
          },
        ],
        input: { state: rdfOnState },
      },
      {
        id: 'write-rotates-every-representation-etag',
        title: 'a state change rotates the ETag of EVERY representation',
        clauses: ['rdf#authoritative-bytes'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'text/turtle' } },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'application/ld+json' } },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: {
              method: 'PUT',
              target: `${NOTES}card.ttl`,
              headers: { 'Content-Type': 'text/turtle', 'If-Match': '${response[0].header.ETag}' },
              body: '<https://storage.example/alice/notes/card.ttl#me> <http://schema.org/name> "Alice v3" .\n',
            },
            expected: { statusOneOf: [200, 204] },
          },
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'text/turtle' } },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'application/ld+json' } },
            expected: { status: 200, headers: { ETag: { present: true } } },
          },
        ],
        input: { state: rdfOnState },
        expected: {
          asserts: [
            { kind: 'differ', refs: ['response[0].header.ETag', 'response[3].header.ETag'] },
            { kind: 'differ', refs: ['response[1].header.ETag', 'response[4].header.ETag'] },
          ],
        },
      },
      {
        id: 'unconditional-put-still-428',
        title: "the core's 428 rule applies unchanged to RDF-readable resources: no unconditional overwrite",
        clauses: ['rdf#authoritative-bytes', 'core#http-update'],
        operation: 'http-exchange',
        input: {
          state: rdfOnState,
          request: {
            method: 'PUT',
            target: `${NOTES}card.ttl`,
            headers: { 'Content-Type': 'text/turtle' },
            body: '<https://storage.example/alice/notes/card.ttl#me> <http://schema.org/name> "clobbered" .\n',
          },
        },
        expected: {
          status: 428,
          stateAfter: { bytesUnchanged: [`${NOTES}card.ttl`] },
        },
      },
      // ------------------------------------------------------------------
      // Degradation (rdf#round-trip last bullet)
      // ------------------------------------------------------------------
      {
        id: 'unparseable-source-degrades-per-resource',
        title: 'when the stored bytes fail to parse, derived representations answer 406 unparseable-source while the stored bytes stay readable',
        clauses: ['rdf#round-trip'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: {
              method: 'GET',
              target: `${NOTES}broken.ttl`,
              headers: { Accept: 'application/ld+json' },
            },
            expected: {
              status: 406,
              problem: { type: 'https://w3id.org/jeswr/lws/problems/unparseable-source' },
            },
          },
          {
            request: {
              method: 'GET',
              target: `${NOTES}broken.ttl`,
              headers: { Accept: 'text/turtle' },
            },
            expected: {
              status: 200,
              body: { byteEquals: '@prefix broken <this is not turtle' },
            },
          },
        ],
        input: {
          state: {
            ...rdfOnState,
            resources: {
              ...rdfOnState.resources,
              [`${NOTES}broken.ttl`]: {
                type: 'DataResource',
                mediaType: 'text/turtle',
                content: '@prefix broken <this is not turtle',
              },
            },
          },
        },
      },
      // ------------------------------------------------------------------
      // normalizes (rdf#normalizes)
      // ------------------------------------------------------------------
      {
        id: 'normalizes-deterministic-readback',
        title: 'under normalizes, two reads without an intervening write return identical bytes (deterministic normalisation)',
        clauses: ['rdf#normalizes'],
        operation: 'http-exchange',
        preconditions: { features: ['normalizes'] },
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'text/turtle' } },
            expected: { status: 200 },
          },
          {
            request: { method: 'GET', target: `${NOTES}card.ttl`, headers: { Accept: 'text/turtle' } },
            expected: { status: 200 },
          },
        ],
        input: {
          state: {
            ...rdfOnState,
            capabilities: [{ ...TTL_ENTRY, normalizes: true }, JSONLD_ENTRY],
          },
        },
        expected: {
          asserts: [
            { kind: 'equal', refs: ['response[0].body', 'response[1].body'] },
            { kind: 'equal', refs: ['response[0].header.ETag', 'response[1].header.ETag'] },
          ],
        },
      },
      // ------------------------------------------------------------------
      // The opt-in OFF (core#content-transformation, rdf#rdf-patch)
      // ------------------------------------------------------------------
      {
        id: 'transform-off-byte-native-only',
        title: 'absent the capability, a data resource has exactly its stored representation: no transformation is performed',
        clauses: ['core#content-transformation'],
        operation: 'http-exchange',
        notes: 'A request for a non-stored type on a transform-less storage yields '
          + 'either 406 or the stored representation (RFC 9110 proactive '
          + 'negotiation) — never a transformed body.',
        input: {
          state: rdfOffState,
          request: {
            method: 'GET',
            target: `${NOTES}card.ttl`,
            headers: { Accept: 'application/ld+json' },
          },
        },
        expected: {
          anyOf: [
            { status: 406 },
            {
              status: 200,
              headers: { 'Content-Type': { mediaType: 'text/turtle' } },
              body: { byteEquals: CARD_TTL },
            },
          ],
        },
      },
      {
        id: 'rdf-patch-not-advertised-when-off',
        title: 'RDF patch formats MUST NOT be advertised (Accept-Patch) for a media type the profile is not on for, and such a PATCH is rejected',
        clauses: ['rdf#rdf-patch', 'core#http-update'],
        operation: 'http-exchange',
        exchanges: [
          {
            request: { method: 'GET', target: `${NOTES}card.ttl` },
            expected: {
              status: 200,
              headers: { 'Accept-Patch': { excludesToken: 'application/sparql-update' } },
            },
          },
          {
            request: {
              method: 'PATCH',
              target: `${NOTES}card.ttl`,
              headers: { 'Content-Type': 'application/sparql-update', 'If-Match': '${response[0].header.ETag}' },
              body: 'INSERT DATA { <https://storage.example/alice/notes/card.ttl#me> <http://schema.org/name> "patched" }',
            },
            expected: { status: 415 },
          },
        ],
        input: { state: rdfOffState },
        expected: { stateAfter: { bytesUnchanged: [`${NOTES}card.ttl`] } },
      },
    ],
  };
}
