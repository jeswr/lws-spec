// AUTHORED-BY Claude Fable 5
//
// Loads the committed test-vector suites (test-vectors/manifest.json and the
// per-suite manifests) into an id-keyed case index. The vectors are the
// repo's generator output — this module only reads them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function loadVectors(repoRoot) {
  const root = join(repoRoot, 'test-vectors');
  const top = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const cases = new Map();
  const suites = [];

  for (const suiteEntry of top.suites) {
    const manifestPath = join(root, suiteEntry.path);
    const suiteDir = dirname(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    suites.push({ ...suiteEntry, dir: suiteDir });
    for (const c of manifest.cases) {
      const casePath = join(suiteDir, c.path);
      const doc = JSON.parse(readFileSync(casePath, 'utf8'));
      cases.set(doc.id, {
        ...doc,
        suite: suiteEntry.suite,
        caseDir: dirname(casePath),
        suiteDir,
      });
    }
  }

  return { manifest: top, suites, cases };
}

/** Resolve a case-relative fixture path (keyring/… resolves from the suite dir). */
export function fixturePath(caseRecord, ref) {
  return ref.startsWith('keyring/')
    ? join(caseRecord.suiteDir, ref)
    : join(caseRecord.caseDir, ref);
}
