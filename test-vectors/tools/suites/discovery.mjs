// AUTHORED-BY Claude Fable 5
// Suite: discovery — the CID-shaped storage description, conformsTo protocol
// version URIs, the capability registry's forward-compatibility rule, the
// storage-description link binding, and the RFC 9728 protected resource
// metadata document (core#discovery-binding, #discovery-model,
// #capability-registry, #authz-discovery).

export default function discovery(ctx) {
  const {
    STORAGE, CORE, RDF1, AS_ISSUER, SPEC_SOURCE, A2A_RDF_EXT, A2A_RDF_SOURCE,
  } = ctx;
  const DESC = `${STORAGE}description`;
  const AIS = `${A2A_RDF_EXT}#AgentInteractionService`;

  const validDescription = {
    '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
    id: STORAGE,
    type: 'Storage',
    conformsTo: [CORE, RDF1],
    capability: [
      {
        type: 'PatchSupport',
        mediaType: { 'application/linkset+json': ['application/merge-patch+json'] },
      },
      {
        type: 'ContentNegotiation',
        source: 'text/turtle',
        target: ['application/ld+json', 'application/n-triples'],
        profile: RDF1,
      },
      { type: 'RecursiveDelete' },
    ],
    service: [
      { type: 'StorageDescription', serviceEndpoint: DESC },
      {
        type: 'NotificationService',
        serviceEndpoint: `${STORAGE}notifications`,
        subscriptionType: ['WebhookSubscription', 'SseSubscription'],
      },
      {
        type: 'AccessRequestService',
        serviceEndpoint: `${STORAGE}.access/requests/`,
        conformsTo: 'https://w3id.org/jeswr/lws/access-profile/odrl-1',
      },
      {
        type: 'AccessGrantService',
        serviceEndpoint: `${STORAGE}.access/grants/`,
        conformsTo: 'https://w3id.org/jeswr/lws/access-profile/odrl-1',
      },
    ],
  };

  const without = (obj, key) => {
    const { [key]: _dropped, ...rest } = obj;
    return rest;
  };

  const baseState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [`${STORAGE}hello.txt`]: { type: 'DataResource', mediaType: 'text/plain', content: 'hi' },
    },
  };

  return {
    suite: 'discovery',
    spec: CORE,
    description:
      'The storage description as the single feature-detection surface: '
      + 'REQUIRED members (id, type, conformsTo, service incl. the '
      + 'StorageDescription self-entry), unknown-capability forward '
      + 'compatibility, the storage-description Link on every resource '
      + 'response, the RFC 9728 protected resource metadata document with '
      + 'the jlws_storage_description extension member, and extension-service '
      + 'consumption (the a2a-rdf AgentInteractionService entry, fail-closed '
      + 'on a non-https endpoint).',
    cases: [
      {
        id: 'storage-description-valid',
        title: 'a complete CID-shaped storage description validates',
        clauses: ['core#discovery-model'],
        operation: 'validate-storage-description',
        input: { document: validDescription },
        expected: { ok: true },
      },
      {
        id: 'storage-description-missing-conformsto',
        title: 'a storage description without the REQUIRED conformsTo member is rejected',
        clauses: ['core#discovery-model'],
        operation: 'validate-storage-description',
        input: { document: without(validDescription, 'conformsTo') },
        expected: { ok: false, errorCode: 'CONFORMS_TO_MISSING' },
      },
      {
        id: 'storage-description-missing-self-service',
        title: 'a storage description whose service set lacks the StorageDescription self-entry is rejected',
        clauses: ['core#discovery-model'],
        operation: 'validate-storage-description',
        input: {
          document: {
            ...validDescription,
            service: validDescription.service.filter((s) => s.type !== 'StorageDescription'),
          },
        },
        expected: { ok: false, errorCode: 'SERVICE_SELF_MISSING' },
      },
      {
        id: 'storage-description-unknown-capability-ignored',
        title: 'consumers MUST ignore unrecognised capability and service types (forward compatibility)',
        clauses: ['core#discovery-model', 'core#capability-registry'],
        operation: 'validate-storage-description',
        input: {
          document: {
            ...validDescription,
            capability: [
              ...validDescription.capability,
              { type: 'https://extension.example/Frobnicate', dial: 11 },
            ],
            service: [
              ...validDescription.service,
              { type: 'https://extension.example/TeleportService', serviceEndpoint: 'https://teleport.example/' },
            ],
          },
        },
        expected: { ok: true },
      },
      {
        id: 'sd-agent-interaction-service',
        title: 'a storage description advertising the a2a-rdf AgentInteractionService extension entry yields the agent-card URL to a recognising consumer',
        clauses: ['core#discovery-model', 'core#capability-registry'],
        operation: 'discover-service',
        source: `${SPEC_SOURCE} core#capability-registry + ${A2A_RDF_SOURCE} #AgentInteractionService (spec-derived; no reference implementation yet)`,
        notes: 'The term is minted and defined by the a2a-rdf extension '
          + '(#AgentInteractionService): serviceEndpoint is the '
          + 'controller-agent\'s A2A Agent Card URL (the card, not the A2A '
          + 'endpoint); conformsTo asserts the agent declares the extension. '
          + 'JLWS needs no edit — extension services use absolute URIs '
          + '(core#capability-registry), and consumers that do not recognise '
          + 'the type ignore it (core#discovery-model; already pinned by '
          + 'storage-description-unknown-capability-ignored).',
        input: {
          document: {
            ...validDescription,
            service: [
              ...validDescription.service,
              {
                type: AIS,
                serviceEndpoint: 'https://agent.example/.well-known/agent-card.json',
                conformsTo: A2A_RDF_EXT,
              },
            ],
          },
          serviceType: AIS,
        },
        expected: {
          found: true,
          serviceEndpoint: 'https://agent.example/.well-known/agent-card.json',
          conformsTo: A2A_RDF_EXT,
        },
      },
      {
        id: 'sd-agent-interaction-service-hostile-fails-closed',
        title: 'a hostile extension-service entry with a non-https serviceEndpoint is unusable: the consumer fails closed and performs no fetch',
        clauses: ['core#discovery-model', 'core#ssrf'],
        operation: 'discover-service',
        source: `${SPEC_SOURCE} core#ssrf + ${A2A_RDF_SOURCE} #AgentInteractionService (spec-derived; no reference implementation yet)`,
        notes: 'The storage description is attacker-influenceable input to '
          + 'any consumer that dereferences advertised endpoints, so the '
          + 'core#ssrf policy (https only, decided before any request) '
          + 'applies to the consumption boundary: an entry whose '
          + 'serviceEndpoint is not https — here the classic cloud-metadata '
          + 'target — MUST NOT be dereferenced; discovery yields no usable '
          + 'entry. (The a2a-rdf negotiation-layer protections, including the '
          + 'no-silent-NL-downgrade rule, are that spec\'s own surface and '
          + 'are vectored in agentic-solid-conformance\'s a2a-rdf suite, not '
          + 'here.)',
        input: {
          document: {
            ...validDescription,
            service: [
              ...validDescription.service,
              {
                type: AIS,
                serviceEndpoint: 'http://169.254.169.254/latest/agent-card.json',
                conformsTo: A2A_RDF_EXT,
              },
            ],
          },
          serviceType: AIS,
        },
        expected: { found: false },
      },
      {
        id: 'storage-description-link-on-get',
        title: 'every GET response on a storage resource links the storage description (rel jlws#storageDescription, alias accepted)',
        clauses: ['core#discovery-binding', 'core#namespace'],
        operation: 'http-exchange',
        input: {
          state: baseState,
          request: { method: 'GET', target: `${STORAGE}hello.txt` },
        },
        expected: {
          status: 200,
          headers: {
            Link: {
              includesLinkRel: {
                relOneOf: [
                  'https://w3id.org/jeswr/lws#storageDescription',
                  'https://www.w3.org/ns/lws#storageDescription',
                ],
              },
            },
          },
        },
      },
      {
        id: 'protected-resource-metadata-document',
        title: 'the RFC 9728 protected resource metadata document carries resource, authorization_servers, and jlws_storage_description',
        clauses: ['core#authz-discovery'],
        operation: 'http-exchange',
        notes: 'The document URI is whatever the 401 challenge advertises as '
          + 'resource_metadata; the harness resolves it from a challenge first.',
        exchanges: [
          {
            request: { method: 'GET', target: `${STORAGE}hello.txt`, agent: null },
            expected: {
              status: 401,
              headers: {
                'WWW-Authenticate': {
                  authParams: {
                    scheme: 'Bearer',
                    params: { resource_metadata: { present: true } },
                  },
                },
              },
            },
          },
          {
            request: { method: 'GET', target: '${response[0].authParam(resource_metadata)}', agent: null },
            expected: {
              status: 200,
              body: {
                jsonHasMembers: ['resource', 'authorization_servers', 'jlws_storage_description'],
                jsonContains: { authorization_servers: [AS_ISSUER] },
              },
            },
          },
        ],
        input: {
          state: {
            ...baseState,
            trustedIssuers: [AS_ISSUER],
          },
        },
      },
    ],
  };
}
