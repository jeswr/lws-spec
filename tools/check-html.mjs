#!/usr/bin/env node
// AUTHORED-BY Claude Fable 5
// Well-formedness gate for the ReSpec docs: stdlib-only tag-balance + structure checks.
// Usage: node tools/check-html.mjs index.html rdf-transform.html
// Checks: (1) every non-void element opened is closed, in order (proper nesting);
// (2) no stray `</...>` without an opener; (3) exactly one <body>, <head>, <html>;
// (4) required ReSpec sections present (#abstract, #sotd, #conformance);
// (5) every internal href="#id" target exists. Exits 1 on any failure.
import { readFileSync } from "node:fs";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
const RAW_TEXT = new Set(["script", "style"]);

function check(file) {
  const src = readFileSync(file, "utf8");
  const errors = [];
  const stack = [];
  const ids = new Set();
  const hrefs = [];
  let counts = { html: 0, head: 0, body: 0 };

  // Strip comments first (keep line structure for line numbers).
  const noComments = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));

  const lineOf = (idx) => noComments.slice(0, idx).split("\n").length;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let m;
  let rawUntil = null; // inside <script>/<style>: skip until the matching close tag
  while ((m = tagRe.exec(noComments)) !== null) {
    const [full, nameRaw, attrs] = m;
    const name = nameRaw.toLowerCase();
    const isClose = full.startsWith("</");
    if (rawUntil) {
      if (isClose && name === rawUntil) rawUntil = null;
      else continue;
    } else if (isClose && RAW_TEXT.has(name)) {
      // close without open handled below
    }
    if (!isClose) {
      const selfClosed = /\/\s*$/.test(attrs);
      const idm = attrs.match(/\bid\s*=\s*("([^"]*)"|'([^']*)')/);
      if (idm) ids.add(idm[2] ?? idm[3]);
      for (const hm of attrs.matchAll(/\bhref\s*=\s*("#([^"]*)"|'#([^']*)')/g)) {
        hrefs.push({ id: hm[2] ?? hm[3], line: lineOf(m.index) });
      }
      if (name in counts) counts[name]++;
      if (VOID.has(name)) continue;
      if (selfClosed) {
        // In HTML, "/>" does NOT close a non-void element — the element stays open in the
        // browser/ReSpec render. Flag it, then track it as open (matching how browsers parse).
        errors.push(
          `${file}:${lineOf(m.index)} non-void <${name} .../> uses XML self-closing syntax ` +
          `(has no effect in HTML; element remains open)`
        );
      }
      if (RAW_TEXT.has(name)) {
        // Find the real close tag; content in between is not markup.
        rawUntil = name;
      }
      stack.push({ name, line: lineOf(m.index) });
    } else {
      if (VOID.has(name)) continue;
      if (stack.length === 0) {
        errors.push(`${file}:${lineOf(m.index)} stray </${name}> with empty stack`);
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.name === name) {
        stack.pop();
      } else {
        // Tolerate an unclosed <p>/<li> implicitly closed by its parent's close tag.
        const implicit = new Set(["p", "li", "dt", "dd", "tr", "td", "th"]);
        let k = stack.length - 1;
        while (k >= 0 && stack[k].name !== name && implicit.has(stack[k].name)) k--;
        if (k >= 0 && stack[k].name === name) {
          stack.length = k;
        } else {
          errors.push(
            `${file}:${lineOf(m.index)} mismatched </${name}> — open stack top is ` +
            `<${top.name}> (opened line ${top.line})`
          );
          stack.pop(); // best-effort resync
        }
      }
    }
  }
  for (const left of stack) {
    errors.push(`${file}: unclosed <${left.name}> opened at line ${left.line}`);
  }
  for (const el of ["html", "head", "body"]) {
    if (counts[el] !== 1) errors.push(`${file}: expected exactly one <${el}>, found ${counts[el]}`);
  }
  for (const req of ["abstract", "sotd", "conformance"]) {
    if (!ids.has(req)) errors.push(`${file}: missing required ReSpec section id="${req}"`);
  }
  for (const { id, line } of hrefs) {
    if (id && !ids.has(id)) errors.push(`${file}:${line} broken internal link #${id}`);
  }
  return errors;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node tools/check-html.mjs <file.html> [...]");
  process.exit(2);
}
let failed = false;
for (const f of files) {
  const errs = check(f);
  if (errs.length) {
    failed = true;
    for (const e of errs) console.error("FAIL " + e);
  } else {
    console.log(`OK   ${f}`);
  }
}
process.exit(failed ? 1 : 0);
