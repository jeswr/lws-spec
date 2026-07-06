// AUTHORED-BY Claude Fable 5
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkHeaders, parseChallenges } from '../lib/link.mjs';

test('parseLinkHeaders: multiple links in one value, quoted rel, params', () => {
  const links = parseLinkHeaders([
    '<https://s.example/a/>; rel="up", <https://s.example/a/x.linkset>; rel="linkset"; type="application/linkset+json"',
    '<https://w3id.org/jeswr/lws#Container>; rel=type',
  ]);
  assert.equal(links.length, 3);
  assert.deepEqual(links[0], { target: 'https://s.example/a/', params: { rel: 'up' }, rels: ['up'] });
  assert.equal(links[1].params.type, 'application/linkset+json');
  assert.deepEqual(links[2].rels, ['type']);
});

test('parseLinkHeaders: multi-rel link matches both rels; commas inside quotes survive', () => {
  const links = parseLinkHeaders(['<https://x.example/>; rel="describedby linkset"; title="a, b"']);
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].rels, ['describedby', 'linkset']);
  assert.equal(links[0].params.title, 'a, b');
});

test('parseChallenges: scheme with params, multiple challenges, quoted commas', () => {
  const ch = parseChallenges([
    'Bearer realm="https://s.example/a/", resource_metadata="https://s.example/.well-known/oauth-protected-resource/a", error="invalid_token"',
    'DPoP algs="ES256 EdDSA"',
  ]);
  assert.equal(ch.length, 2);
  assert.equal(ch[0].scheme, 'Bearer');
  assert.equal(ch[0].params.realm, 'https://s.example/a/');
  assert.equal(ch[0].params.error, 'invalid_token');
  assert.equal(ch[1].scheme, 'DPoP');
  assert.equal(ch[1].params.algs, 'ES256 EdDSA');
});

test('parseChallenges: bare scheme then a second challenge in the same value', () => {
  const ch = parseChallenges(['Basic, Bearer realm="r"']);
  assert.deepEqual(ch.map((c) => c.scheme), ['Basic', 'Bearer']);
  assert.equal(ch[1].params.realm, 'r');
});
