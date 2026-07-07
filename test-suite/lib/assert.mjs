// AUTHORED-BY Claude Fable 5
//
// Evaluates a vector's `expected` object against a captured HTTP response.
// Implements the full assertion vocabulary of test-vectors/README.md
// ("Response assertions"). Returns an array of human-readable failure
// strings; [] means the response satisfies the expectation.

import { headerCombined, headerValues } from './http.mjs';
import { parseChallenges, parseLinkHeaders } from './link.mjs';

const isAbsoluteUri = (v) => /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/.test(v) || /^urn:[^\s]+$/i.test(v);

const mediaTypeOf = (value) => (value ?? '').split(';')[0].trim().toLowerCase();

const tokenList = (value) =>
  value == null ? [] : value.split(',').map((t) => t.trim()).filter(Boolean);

/** Scalar assertions shared by header values, auth params, and JSON members. */
export function evalScalar(name, assertion, value, failures) {
  for (const [key, arg] of Object.entries(assertion)) {
    switch (key) {
      case 'present':
        if (value == null) failures.push(`${name}: expected present, was absent`);
        break;
      case 'absent':
        if (value != null) failures.push(`${name}: expected absent, was ${JSON.stringify(value)}`);
        break;
      case 'equals':
        if (value !== arg) failures.push(`${name}: expected ${JSON.stringify(arg)}, got ${JSON.stringify(value)}`);
        break;
      case 'notEquals':
        if (value === arg) failures.push(`${name}: expected a value different from ${JSON.stringify(arg)}`);
        break;
      case 'startsWith':
        if (typeof value !== 'string' || !value.startsWith(arg)) {
          failures.push(`${name}: expected to start with ${JSON.stringify(arg)}, got ${JSON.stringify(value)}`);
        }
        break;
      case 'absoluteUri':
        if (typeof value !== 'string' || !isAbsoluteUri(value)) {
          failures.push(`${name}: expected an absolute URI, got ${JSON.stringify(value)}`);
        }
        break;
      case 'atMost':
        if (typeof value !== 'number' || value > arg) {
          failures.push(`${name}: expected a number <= ${arg}, got ${JSON.stringify(value)}`);
        }
        break;
      case 'mediaType':
        if (mediaTypeOf(typeof value === 'string' ? value : '') !== String(arg).toLowerCase()) {
          failures.push(`${name}: expected media type ${arg}, got ${JSON.stringify(value)}`);
        }
        break;
      default:
        failures.push(`${name}: unsupported scalar assertion ${key}`);
    }
  }
}

function linkMatches(link, spec) {
  const rels = spec.relOneOf ?? (spec.rel != null ? [spec.rel] : []);
  if (rels.length > 0 && !rels.some((r) => link.rels.includes(r))) return false;
  if (spec.target != null && link.target !== spec.target) return false;
  return true;
}

function evalHeaderAssertion(res, headerName, assertion, failures) {
  const combined = headerCombined(res, headerName);
  const label = `header ${headerName}`;
  for (const [key, arg] of Object.entries(assertion)) {
    switch (key) {
      case 'includesToken': {
        if (!tokenList(combined).some((t) => t.toLowerCase() === String(arg).toLowerCase())) {
          failures.push(`${label}: expected token ${arg} in ${JSON.stringify(combined)}`);
        }
        break;
      }
      case 'excludesToken': {
        if (tokenList(combined).some((t) => t.toLowerCase() === String(arg).toLowerCase())) {
          failures.push(`${label}: token ${arg} must not appear (got ${JSON.stringify(combined)})`);
        }
        break;
      }
      case 'includesLinkRel': {
        const links = parseLinkHeaders(headerValues(res, headerName));
        if (!links.some((l) => linkMatches(l, arg))) {
          failures.push(`${label}: no link matching ${JSON.stringify(arg)} in ${JSON.stringify(combined)}`);
        }
        break;
      }
      case 'includesLinkRelAll': {
        const links = parseLinkHeaders(headerValues(res, headerName));
        for (const spec of arg) {
          if (!links.some((l) => linkMatches(l, spec))) {
            failures.push(`${label}: no link matching ${JSON.stringify(spec)} in ${JSON.stringify(combined)}`);
          }
        }
        break;
      }
      case 'authParams': {
        const challenges = parseChallenges(headerValues(res, headerName));
        const match = challenges.find((c) => c.scheme.toLowerCase() === arg.scheme.toLowerCase());
        if (!match) {
          failures.push(`${label}: no ${arg.scheme} challenge (got ${JSON.stringify(combined)})`);
          break;
        }
        for (const [pname, passertion] of Object.entries(arg.params ?? {})) {
          evalScalar(`${label} ${arg.scheme} param ${pname}`, passertion, match.params[pname.toLowerCase()], failures);
        }
        break;
      }
      case 'excludesScheme': {
        const challenges = parseChallenges(headerValues(res, headerName));
        if (challenges.some((c) => c.scheme.toLowerCase() === String(arg).toLowerCase())) {
          failures.push(`${label}: must carry no ${arg} challenge (got ${JSON.stringify(combined)})`);
        }
        break;
      }
      default:
        evalScalar(label, { [key]: arg }, combined, failures);
    }
  }
}

/** Recursive subset match per the README (`jsonContains`). */
export function jsonSubsetMatches(expected, actual) {
  if (expected === null || typeof expected !== 'object') return expected === actual;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((e) => actual.some((a) => jsonSubsetMatches(e, a)));
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([k, v]) => k in actual && jsonSubsetMatches(v, actual[k]));
}

const atPath = (obj, path) =>
  path.split('.').reduce((acc, seg) => (acc != null && typeof acc === 'object' ? acc[seg] : undefined), obj);

function evalBodyAssertion(res, assertion, failures) {
  const text = res.body.toString('utf8');
  let json;
  let jsonError = null;
  const parsed = () => {
    if (json === undefined && jsonError === null) {
      try {
        json = JSON.parse(text);
      } catch (e) {
        jsonError = e;
      }
    }
    if (jsonError) failures.push(`body: expected JSON, parse failed (${jsonError.message})`);
    return json;
  };

  for (const [key, arg] of Object.entries(assertion)) {
    switch (key) {
      case 'byteEquals':
        if (!res.body.equals(Buffer.from(arg, 'utf8'))) {
          failures.push(`body: bytes differ (expected ${JSON.stringify(arg)}, got ${JSON.stringify(text.slice(0, 200))})`);
        }
        break;
      case 'byteEqualsBase64':
        if (!res.body.equals(Buffer.from(arg, 'base64'))) {
          failures.push(`body: bytes differ from base64 fixture (${res.body.length} bytes)`);
        }
        break;
      case 'empty':
        if (res.body.length !== 0) failures.push(`body: expected empty, got ${res.body.length} bytes`);
        break;
      case 'jsonParses': {
        // Any valid JSON document — a top-level object OR array. Use this where the spec
        // constrains the encoded CONTENT, not the JSON document shape (e.g. a derived JSON-LD
        // representation: a JSON-LD serializer may legitimately emit a top-level node-object
        // array; rdf-1 pins the encoded graph via the library isomorphism vectors, not the
        // document shape).
        parsed();
        break;
      }
      case 'jsonIsObject': {
        const j = parsed();
        if (j !== undefined && (j === null || typeof j !== 'object' || Array.isArray(j))) {
          failures.push('body: expected a JSON object');
        }
        break;
      }
      case 'jsonContains': {
        const j = parsed();
        if (j !== undefined && !jsonSubsetMatches(arg, j)) {
          failures.push(`body: JSON does not contain subset ${JSON.stringify(arg).slice(0, 300)} (got ${text.slice(0, 300)})`);
        }
        break;
      }
      case 'jsonHasMembers': {
        const j = parsed();
        if (j !== undefined) {
          for (const m of arg) {
            if (j == null || typeof j !== 'object' || !(m in j)) failures.push(`body: missing JSON member ${m}`);
          }
        }
        break;
      }
      case 'jsonLacksMembers': {
        const j = parsed();
        if (j !== undefined && j != null && typeof j === 'object') {
          for (const m of arg) {
            if (m in j) failures.push(`body: JSON member ${m} must not be present`);
          }
        }
        break;
      }
      case 'jsonMemberMatches': {
        const j = parsed();
        if (j !== undefined) {
          for (const [member, massertion] of Object.entries(arg)) {
            evalScalar(`body member ${member}`, massertion, j?.[member], failures);
          }
        }
        break;
      }
      case 'jsonArrayExcludes': {
        const j = parsed();
        if (j !== undefined) {
          const arr = atPath(j, arg.path);
          if (!Array.isArray(arr)) {
            failures.push(`body: ${arg.path} is not an array`);
          } else if (arr.some((el) => jsonSubsetMatches(arg.subset, el))) {
            failures.push(`body: array at ${arg.path} must exclude ${JSON.stringify(arg.subset)}`);
          }
        }
        break;
      }
      default:
        failures.push(`body: unsupported assertion ${key}`);
    }
  }
}

/**
 * Evaluate one `expected` object (minus stateAfter/asserts, which the
 * exchange executor owns) against a response.
 */
export function evaluateExpected(expected, res) {
  const failures = [];
  if (expected.anyOf) {
    const alternatives = expected.anyOf.map((alt) => evaluateExpected(alt, res));
    if (!alternatives.some((f) => f.length === 0)) {
      failures.push(
        `anyOf: no alternative satisfied — ${alternatives.map((f, i) => `[${i}] ${f.join('; ')}`).join(' | ')}`,
      );
    }
  }
  if (expected.status != null && res.status !== expected.status) {
    failures.push(`status: expected ${expected.status}, got ${res.status}`);
  }
  if (expected.statusOneOf && !expected.statusOneOf.includes(res.status)) {
    failures.push(`status: expected one of ${expected.statusOneOf.join('/')}, got ${res.status}`);
  }
  if (expected.statusClass) {
    const cls = `${Math.floor(res.status / 100)}xx`;
    if (cls !== expected.statusClass) failures.push(`status: expected class ${expected.statusClass}, got ${res.status}`);
  }
  if (expected.headers) {
    for (const [name, assertion] of Object.entries(expected.headers)) {
      evalHeaderAssertion(res, name, assertion, failures);
    }
  }
  if (expected.body) evalBodyAssertion(res, expected.body, failures);
  if (expected.problem) {
    const ct = mediaTypeOf(headerCombined(res, 'Content-Type') ?? '');
    if (ct !== 'application/problem+json') {
      failures.push(`problem: expected application/problem+json, got ${ct || '(none)'}`);
    } else {
      try {
        const j = JSON.parse(res.body.toString('utf8'));
        if (j?.type !== expected.problem.type) {
          failures.push(`problem: expected type ${expected.problem.type}, got ${JSON.stringify(j?.type)}`);
        }
      } catch (e) {
        failures.push(`problem: body is not JSON (${e.message})`);
      }
    }
  }
  return failures;
}
