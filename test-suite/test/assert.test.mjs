// AUTHORED-BY Claude Fable 5
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpected, jsonSubsetMatches } from '../lib/assert.mjs';

const res = ({ status = 200, headers = {}, body = '' } = {}) => ({
  status,
  headers: new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v : [v]])),
  body: Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'),
});

test('status / statusOneOf / statusClass', () => {
  assert.deepEqual(evaluateExpected({ status: 201 }, res({ status: 201 })), []);
  assert.equal(evaluateExpected({ status: 201 }, res({ status: 205 })).length, 1);
  assert.deepEqual(evaluateExpected({ statusOneOf: [400, 404] }, res({ status: 404 })), []);
  assert.deepEqual(evaluateExpected({ statusClass: '4xx' }, res({ status: 428 })), []);
  assert.equal(evaluateExpected({ statusClass: '4xx' }, res({ status: 201 })).length, 1);
});

test('anyOf: satisfied by one alternative', () => {
  const r = res({ status: 409 });
  assert.deepEqual(evaluateExpected({ anyOf: [{ status: 404 }, { status: 409 }] }, r), []);
  assert.equal(evaluateExpected({ anyOf: [{ status: 404 }, { status: 410 }] }, r).length, 1);
});

test('header assertions: present/absent/equals/mediaType/startsWith/absoluteUri', () => {
  const r = res({ headers: { ETag: '"v1"', 'Content-Type': 'application/ld+json; charset=utf-8', Location: 'https://s.example/a/x' } });
  assert.deepEqual(evaluateExpected({ headers: { ETag: { present: true } } }, r), []);
  assert.deepEqual(evaluateExpected({ headers: { 'X-Nope': { absent: true } } }, r), []);
  assert.deepEqual(evaluateExpected({ headers: { 'Content-Type': { mediaType: 'application/ld+json' } } }, r), []);
  assert.deepEqual(evaluateExpected({ headers: { Location: { startsWith: 'https://s.example/a/', absoluteUri: true } } }, r), []);
  assert.equal(evaluateExpected({ headers: { ETag: { equals: '"v2"' } } }, r).length, 1);
});

test('header token-list and link-rel assertions', () => {
  const r = res({
    headers: {
      'Accept-Patch': 'application/merge-patch+json, text/n3',
      Link: ['<https://s.example/a/>; rel="up"', '<https://s.example/a/x.linkset>; rel="linkset"'],
    },
  });
  assert.deepEqual(evaluateExpected({ headers: { 'Accept-Patch': { includesToken: 'application/merge-patch+json' } } }, r), []);
  assert.deepEqual(evaluateExpected({ headers: { 'Accept-Patch': { excludesToken: 'text/turtle' } } }, r), []);
  assert.deepEqual(evaluateExpected({ headers: { 'X-Absent': { excludesToken: 'anything' } } }, r), []);
  assert.deepEqual(
    evaluateExpected({ headers: { Link: { includesLinkRel: { rel: 'up', target: 'https://s.example/a/' } } } }, r),
    [],
  );
  assert.deepEqual(
    evaluateExpected(
      { headers: { Link: { includesLinkRelAll: [{ rel: 'linkset' }, { relOneOf: ['up', 'parent'] }] } } },
      r,
    ),
    [],
  );
  assert.equal(
    evaluateExpected({ headers: { Link: { includesLinkRel: { rel: 'up', target: 'https://other.example/' } } } }, r).length,
    1,
  );
});

test('authParams and excludesScheme', () => {
  const r = res({
    headers: { 'WWW-Authenticate': 'Bearer realm="https://s.example/a/", resource_metadata="https://s.example/prm"' },
  });
  assert.deepEqual(
    evaluateExpected(
      { headers: { 'WWW-Authenticate': { authParams: { scheme: 'Bearer', params: { realm: { absoluteUri: true }, error: { absent: true } } } } } },
      r,
    ),
    [],
  );
  assert.deepEqual(evaluateExpected({ headers: { 'WWW-Authenticate': { excludesScheme: 'Basic' } } }, r), []);
  assert.equal(evaluateExpected({ headers: { 'WWW-Authenticate': { excludesScheme: 'Bearer' } } }, r).length, 1);
});

test('body assertions: bytes, empty, json family', () => {
  const j = res({ headers: { 'Content-Type': 'application/ld+json' }, body: JSON.stringify({ id: 'x', type: 'Container', items: [{ id: 'a', type: 'DataResource' }], totalItems: 1 }) });
  assert.deepEqual(evaluateExpected({ body: { jsonIsObject: true } }, j), []);
  assert.deepEqual(evaluateExpected({ body: { jsonContains: { type: 'Container', items: [{ id: 'a' }] } } }, j), []);
  assert.equal(evaluateExpected({ body: { jsonContains: { items: [{ id: 'b' }] } } }, j).length, 1);
  assert.deepEqual(evaluateExpected({ body: { jsonHasMembers: ['id', 'totalItems'] } }, j), []);
  assert.deepEqual(evaluateExpected({ body: { jsonLacksMembers: ['actor'] } }, j), []);
  assert.deepEqual(evaluateExpected({ body: { jsonMemberMatches: { totalItems: { atMost: 1 } } } }, j), []);
  assert.deepEqual(evaluateExpected({ body: { jsonArrayExcludes: { path: 'items', subset: { id: 'b' } } } }, j), []);
  assert.equal(evaluateExpected({ body: { jsonArrayExcludes: { path: 'items', subset: { id: 'a' } } } }, j).length, 1);
  assert.deepEqual(evaluateExpected({ body: { byteEquals: 'hi' } }, res({ body: 'hi' })), []);
  assert.deepEqual(evaluateExpected({ body: { byteEqualsBase64: Buffer.from('hi').toString('base64') } }, res({ body: 'hi' })), []);
  assert.deepEqual(evaluateExpected({ body: { empty: true } }, res({ body: '' })), []);
});

test('problem assertion', () => {
  const p = res({
    status: 404,
    headers: { 'Content-Type': 'application/problem+json' },
    body: JSON.stringify({ type: 'https://w3id.org/jeswr/lws/problems/not-found', status: 404 }),
  });
  assert.deepEqual(evaluateExpected({ problem: { type: 'https://w3id.org/jeswr/lws/problems/not-found' } }, p), []);
  assert.equal(evaluateExpected({ problem: { type: 'https://w3id.org/jeswr/lws/problems/other' } }, p).length, 1);
  assert.equal(evaluateExpected({ problem: { type: 'x' } }, res({ headers: { 'Content-Type': 'text/plain' }, body: 'nope' })).length, 1);
});

test('jsonSubsetMatches: arrays are order-insensitive subset', () => {
  assert.equal(jsonSubsetMatches([{ a: 1 }], [{ b: 2 }, { a: 1, c: 3 }]), true);
  assert.equal(jsonSubsetMatches([{ a: 1 }, { a: 1 }], [{ a: 1 }]), true); // subset, per README semantics
  assert.equal(jsonSubsetMatches({ a: [1, 2] }, { a: [2, 1, 3] }), true);
  assert.equal(jsonSubsetMatches({ a: 1 }, { a: 2 }), false);
});
