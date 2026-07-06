#!/usr/bin/env node
// AUTHORED-BY Claude Fable 5
//
// CLI: run the JLWS conformance suite against a target server.
//
//   node bin/run.mjs --target http://localhost:3000 --label "my server"
//   node bin/run.mjs --config targets/css-baseline.json \
//     --out-json ../reports/css-baseline.json --out-md ../reports/css-baseline.md
//
// Flags:
//   --target <url>        base URL of the server under test
//   --config <path>       JSON target config (see lib/config.mjs for the schema)
//   --label <text>        report label (overrides config)
//   --baseline-note <t>   interpretation note printed at the top of the scoreboard
//   --out-json <path>     write the full JSON report
//   --out-md <path>       write the markdown scoreboard
//   --only <prefix>       run only cases whose id starts with the prefix
//   --strict              exit 1 when any executed MUST-level statement fails
//                         (for CI against a real JLWS implementation; a
//                         baseline run over a non-JLWS server stays exit 0)
//   --quiet               no per-case progress lines

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { runSuite } from '../lib/runner.mjs';
import { renderMarkdown } from '../lib/report.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const overrides = {};
if (flag('target')) overrides.target = flag('target');
if (flag('label')) overrides.label = flag('label');
const config = loadConfig({ configPath: flag('config'), overrides });

const only = flag('only');
const report = await runSuite(repoRoot, config, {
  caseFilter: only ? (id) => id.startsWith(only) : () => true,
  log: has('quiet') ? () => {} : (line) => process.stderr.write(`${line}\n`),
});

const markdown = renderMarkdown(report, { baselineNote: flag('baseline-note') });

if (flag('out-json')) {
  mkdirSync(dirname(resolve(flag('out-json'))), { recursive: true });
  writeFileSync(resolve(flag('out-json')), `${JSON.stringify(report, null, 2)}\n`);
}
if (flag('out-md')) {
  mkdirSync(dirname(resolve(flag('out-md'))), { recursive: true });
  writeFileSync(resolve(flag('out-md')), `${markdown}\n`);
}

const h = report.summary.headline;
const line = (lvl) => `${lvl}: ${h[lvl].pass}/${h[lvl].executed} pass`;
process.stderr.write(
  [
    '',
    `JLWS conformance — ${config.label} @ ${config.target}`,
    `statements: ${report.summary.statements.total} (${JSON.stringify(report.summary.statements.byCategory)})`,
    `executed: ${line('MUST')}, ${line('MUST NOT')}, ${line('SHOULD')}, ${line('SHOULD NOT')}, ${line('MAY')}`,
    `cases: ${JSON.stringify(report.summary.cases)}`,
    '',
  ].join('\n'),
);

if (!flag('out-json') && !flag('out-md')) process.stdout.write(`${markdown}\n`);

if (has('strict') && (h.MUST.fail > 0 || h['MUST NOT'].fail > 0)) process.exit(1);
