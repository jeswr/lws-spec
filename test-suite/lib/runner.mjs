// AUTHORED-BY Claude Fable 5
//
// Orchestrates a full conformance run: load companions + vectors, plan every
// case against the target config, execute the executable ones, aggregate to
// per-statement verdicts.

import { loadCompanions } from './companion.mjs';
import { loadVectors } from './vectors.mjs';
import { planCase, ExchangeRunner } from './exchange.mjs';
import { aggregate } from './plan.mjs';

const HARNESS_VERSION = '0.1.0';

/**
 * @param {string} repoRoot path to the lws-spec checkout
 * @param {object} config from loadConfig
 * @param {{caseFilter?: (id: string) => boolean, log?: (line: string) => void}} opts
 */
export async function runSuite(repoRoot, config, { caseFilter = () => true, log = () => {} } = {}) {
  const companions = loadCompanions(repoRoot);
  const vectors = loadVectors(repoRoot);
  const runId = `jlws-${Date.now().toString(36)}`;
  const runner = new ExchangeRunner(config, runId);

  const caseResults = new Map();
  for (const [id, caseRecord] of vectors.cases) {
    if (!caseFilter(id)) {
      caseResults.set(id, { disposition: 'skip-filtered', detail: 'excluded by case filter' });
      continue;
    }
    const plan = planCase(caseRecord, config);
    if (!plan.run) {
      caseResults.set(id, { disposition: `skip-${plan.reason}`, detail: plan.detail });
      continue;
    }
    log(`run ${id}`);
    let result;
    try {
      result = await runner.runCase(caseRecord);
    } catch (e) {
      result = { disposition: 'error-setup', failures: [`harness error: ${e.message}`] };
    }
    caseResults.set(id, {
      disposition: result.disposition,
      failures: result.failures,
      detail: result.failures?.[0] ?? null,
      level: caseRecord.level,
      title: caseRecord.title,
    });
    log(`  -> ${result.disposition}${result.failures?.length ? ` (${result.failures.length} finding(s))` : ''}`);
  }

  const { rows, summary } = aggregate(companions.statements, caseResults);

  // Case-level summary (includes vectors not wired to any statement — they
  // pin keywordless clauses catalogued as extraction notes).
  const caseSummary = {};
  for (const r of caseResults.values()) {
    caseSummary[r.disposition] = (caseSummary[r.disposition] ?? 0) + 1;
  }
  const wired = new Set(companions.statements.flatMap((s) => s.testCases));

  return {
    meta: {
      harnessVersion: HARNESS_VERSION,
      generatedAt: new Date().toISOString(),
      target: config.target,
      label: config.label,
      runId,
      features: config.features,
      capabilities: config.capabilities,
      conformsTo: config.conformsTo,
      agentsConfigured: Object.keys(config.agents).length,
      companionPins: {
        core: companions.meta.core.specVersion,
        'rdf-transform': companions.meta['rdf-transform'].specVersion,
      },
      vectorPin: vectors.manifest.specSource,
      vectorCount: vectors.manifest.caseCount,
    },
    summary: { ...summary, cases: caseSummary, unwiredCases: [...vectors.cases.keys()].filter((id) => !wired.has(id)).length },
    statements: rows,
    cases: Object.fromEntries([...caseResults.entries()].map(([id, r]) => [id, r])),
  };
}
