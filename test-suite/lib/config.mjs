// AUTHORED-BY Claude Fable 5
//
// Target configuration: which server the suite runs against and which
// optional features / capabilities / credential seams that target provides.
// Everything defaults to the most conservative honest reading: no optional
// features, no agents, no access realizer — cases needing more are reported
// as skipped, never guessed.

import { readFileSync } from 'node:fs';

export const DEFAULT_CONFIG = Object.freeze({
  // Base URL of the server under test (REQUIRED), e.g. http://localhost:3000
  target: null,
  // Human label for the report header.
  label: 'unnamed target',
  // Harness-level feature toggles the target provides (vector `preconditions.features`):
  // pop-required-realm, pop-profile-dpop, pop-profile-dpop-sk, suite-webauthn,
  // sse-subscription, websocket-subscription, normalizes, storage-quota.
  features: [],
  // Registry capability types the target provides (vector `preconditions.capabilities`
  // and `state.capabilities` entries): RecursiveDelete, MoveResource, ContentNegotiation, ….
  capabilities: [],
  // Protocol/profile URIs the target advertises (vector `state.conformsTo`).
  conformsTo: [],
  // Authenticated-agent seam: agent URI -> { bearer: "<token>" }. Cases whose
  // requests authenticate as an agent with no entry here are unrealisable.
  agents: {},
  // How `state.access` maps are realised on the target: 'none' (skip cases
  // that depend on one). Server-specific realizers are a follow-up seam.
  accessRealizer: 'none',
  // Optional bearer token for storage-controller requests (default: anonymous).
  controllerBearer: null,
  // Per-request timeout.
  timeoutMs: 15000,
});

export function loadConfig({ configPath = null, overrides = {} }) {
  const fromFile = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  const config = { ...DEFAULT_CONFIG, ...fromFile, ...overrides };
  if (!config.target) throw new Error('config: target base URL is required (--target or config file)');
  config.target = config.target.replace(/\/+$/, '');
  if (!/^https?:\/\//.test(config.target)) throw new Error(`config: target must be http(s): ${config.target}`);
  for (const [agent, entry] of Object.entries(config.agents)) {
    if (!entry || typeof entry.bearer !== 'string') {
      throw new Error(`config: agents[${agent}] must be { "bearer": "<token>" }`);
    }
  }
  if (
    config.controllerBearer !== null &&
    (typeof config.controllerBearer !== 'string' || config.controllerBearer.trim() === '')
  ) {
    throw new Error('config: controllerBearer must be null or a non-empty token string');
  }
  return config;
}
