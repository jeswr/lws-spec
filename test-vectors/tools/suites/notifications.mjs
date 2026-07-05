// AUTHORED-BY Claude Fable 5
// Suite: notifications — the subscription API (read access on every topic),
// the SSE and WebSocket binding response shapes, the content-free envelope,
// and RFC 9421-signed webhook delivery verification against the storage
// description's verificationMethod set (core#subscription-api,
// #notification-envelope, #webhook-binding, #sse-binding,
// #websocket-binding).

export default function notifications(ctx) {
  const {
    STORAGE, CORE, BOB, NOW, notificationsKeyring, webhookFixture, envelope,
  } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;
  const B = `${NOTES}b.txt`;
  const SVC = `${STORAGE}notifications`;

  const subState = {
    storageRoot: STORAGE,
    notificationService: SVC,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: 'alpha' },
      [B]: { type: 'DataResource', mediaType: 'text/plain', content: 'beta' },
    },
    access: { [BOB]: { [A]: ['read'] } },
  };

  const webhookInput = (fileref = 'delivery.json') => ({
    delivery: fileref,
    storageDescription: 'keyring/storage-description.json',
    now: NOW,
  });

  return {
    suite: 'notifications',
    spec: CORE,
    description:
      'Subscriptions and notification delivery: subscription creation is '
      + 'rejected unless the agent has read access to EVERY topic; the SSE and '
      + 'WebSocket binding responses carry source / receiveFrom; the envelope '
      + 'is content-free with REQUIRED published and default-omitted actor; '
      + 'webhook deliveries are RFC 9421-signed (Ed25519) with the keyid '
      + "resolving into the storage description's verificationMethod set and "
      + 'RFC 9530 Content-Digest coverage.',
    keyring: notificationsKeyring,
    cases: [
      // ------------------------------------------------------------------
      // Subscription API (core#subscription-api)
      // ------------------------------------------------------------------
      {
        id: 'subscription-requires-read-on-all-topics',
        title: 'a subscription whose agent lacks read access to every topic is rejected',
        clauses: ['core#subscription-api'],
        operation: 'http-exchange',
        input: {
          state: subState,
          request: {
            method: 'POST',
            target: SVC,
            agent: BOB,
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify({
              '@context': 'https://w3id.org/jeswr/lws/v1',
              type: 'SseSubscription',
              topic: [A, B],
            }),
          },
        },
        expected: { statusClass: '4xx' },
      },
      {
        id: 'sse-subscription-returns-source',
        title: 'creating an SSE subscription returns the event-stream URL in source',
        clauses: ['core#sse-binding', 'core#subscription-api'],
        operation: 'http-exchange',
        preconditions: { features: ['sse-subscription'] },
        input: {
          state: subState,
          request: {
            method: 'POST',
            target: SVC,
            agent: BOB,
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify({
              '@context': 'https://w3id.org/jeswr/lws/v1',
              type: 'SseSubscription',
              topic: [A],
            }),
          },
        },
        expected: {
          statusOneOf: [200, 201],
          body: {
            jsonHasMembers: ['source'],
            jsonMemberMatches: { source: { startsWith: 'https://' } },
          },
        },
      },
      {
        id: 'websocket-subscription-returns-receivefrom',
        title: 'creating a WebSocket subscription returns a wss: capability URL in receiveFrom',
        clauses: ['core#websocket-binding', 'core#subscription-api'],
        operation: 'http-exchange',
        preconditions: { features: ['websocket-subscription'] },
        input: {
          state: subState,
          request: {
            method: 'POST',
            target: SVC,
            agent: BOB,
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify({
              '@context': 'https://w3id.org/jeswr/lws/v1',
              type: 'WebSocketSubscription',
              topic: [A],
            }),
          },
        },
        expected: {
          statusOneOf: [200, 201],
          body: {
            jsonHasMembers: ['receiveFrom'],
            jsonMemberMatches: { receiveFrom: { startsWith: 'wss://' } },
          },
        },
      },
      // ------------------------------------------------------------------
      // Envelope (core#notification-envelope)
      // ------------------------------------------------------------------
      {
        id: 'envelope-valid',
        title: 'a content-free Update envelope with published and an id+type-only object validates',
        clauses: ['core#notification-envelope'],
        operation: 'validate-notification-envelope',
        input: { envelope, subscriberMayLearnActor: false },
        expected: { ok: true },
      },
      {
        id: 'envelope-must-not-carry-content',
        title: 'an envelope whose object carries resource content is rejected',
        clauses: ['core#notification-envelope'],
        operation: 'validate-notification-envelope',
        input: {
          envelope: {
            ...envelope,
            object: { ...envelope.object, content: 'leaked resource body' },
          },
          subscriberMayLearnActor: false,
        },
        expected: { ok: false, errorCode: 'CONTENT_INCLUDED' },
      },
      {
        id: 'envelope-published-required',
        title: 'an envelope without published is rejected',
        clauses: ['core#notification-envelope'],
        operation: 'validate-notification-envelope',
        input: {
          envelope: (() => {
            const { published: _dropped, ...rest } = envelope;
            return rest;
          })(),
          subscriberMayLearnActor: false,
        },
        expected: { ok: false, errorCode: 'PUBLISHED_MISSING' },
      },
      {
        id: 'envelope-actor-omitted-by-default',
        title: 'actor MUST be omitted unless the subscriber is authorised to learn it',
        clauses: ['core#notification-envelope'],
        operation: 'validate-notification-envelope',
        input: {
          envelope: { ...envelope, actor: 'https://id.example/alice' },
          subscriberMayLearnActor: false,
        },
        expected: { ok: false, errorCode: 'ACTOR_DISCLOSED' },
      },
      // ------------------------------------------------------------------
      // Webhook delivery signatures (core#webhook-binding)
      // ------------------------------------------------------------------
      {
        id: 'webhook-signature-valid',
        title: 'a correctly signed webhook delivery verifies: RFC 9421 Ed25519 signature, required coverage, keyid resolved from verificationMethod',
        clauses: ['core#webhook-binding', 'core#discovery-model'],
        operation: 'verify-webhook-signature',
        input: webhookInput(),
        expected: { ok: true },
        files: webhookFixture(),
      },
      {
        id: 'webhook-body-tampered-rejected',
        title: 'a delivery whose body does not match the covered Content-Digest is rejected',
        clauses: ['core#webhook-binding'],
        operation: 'verify-webhook-signature',
        input: webhookInput(),
        expected: { ok: false, errorCode: 'CONTENT_DIGEST_MISMATCH' },
        files: webhookFixture({ tamperBody: true }),
      },
      {
        id: 'webhook-unknown-keyid-rejected',
        title: "a delivery whose keyid does not resolve into the storage description's verificationMethod set is rejected",
        clauses: ['core#webhook-binding'],
        operation: 'verify-webhook-signature',
        input: webhookInput(),
        expected: { ok: false, errorCode: 'KEY_UNRESOLVED' },
        files: webhookFixture({ badKeyid: true }),
      },
      {
        id: 'webhook-insufficient-coverage-rejected',
        title: 'a signature not covering the REQUIRED components (here content-digest) is rejected even though it verifies cryptographically',
        clauses: ['core#webhook-binding'],
        operation: 'verify-webhook-signature',
        input: webhookInput(),
        expected: { ok: false, errorCode: 'COVERAGE_INSUFFICIENT' },
        files: webhookFixture({ omitDigestCoverage: true }),
      },
      {
        id: 'webhook-bad-signature-rejected',
        title: 'a delivery whose signature bytes do not verify is rejected',
        clauses: ['core#webhook-binding'],
        operation: 'verify-webhook-signature',
        input: webhookInput(),
        expected: { ok: false, errorCode: 'SIGNATURE_INVALID' },
        files: webhookFixture({ corruptSignature: true }),
      },
    ],
  };
}
