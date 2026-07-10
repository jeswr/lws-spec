#!/usr/bin/env sh
# AUTHORED-BY Claude Fable 5
# Validate the JLWS document-conformance-class SHACL shapes (shapes/*.ttl) against
# their fixtures:
#   1. Turtle syntax of every shapes file and fixture.
#   2. Positive fixtures (examples/positive/*.ttl) MUST conform.
#   3. Negative fixtures (examples/negative/*.ttl) MUST be rejected (a SHACL
#      Violation) — proving the constraints actually bite. Because the shapes use
#      subjects-of/class targeting, the negatives double as canaries against a
#      mis-mapped term IRI silently making validation vacuous.
# Every fixture is validated against the UNION of all shapes files: the shapes'
# targeting is designed to be cross-fire-free (a grant's Container target matcher or
# a sub-container member description is never selected as a container LISTING — see
# the targeting notes in each shapes file), and running the union proves that.
# --allow-warnings makes advisory (sh:Warning, the spec's SHOULDs) results
# non-blocking; Violations still fail.
# Requires pyshacl (pip install pyshacl; rdflib comes with it) — the same engine the
# Stage-1 lws-ucr ontology validation uses. Exit 0 = syntax OK, every positive
# conforms, every negative is rejected.
set -eu
cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-python3}"
if [ -n "${PYSHACL:-}" ]; then
  : # caller-supplied
elif command -v pyshacl >/dev/null 2>&1; then
  PYSHACL="pyshacl"
elif "$PYTHON" -c "import pyshacl" >/dev/null 2>&1; then
  PYSHACL="$PYTHON -m pyshacl"
else
  echo "pyshacl not found (pip install pyshacl, or set PYSHACL=)" >&2
  exit 2
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
status=0

echo "== Turtle syntax: shapes + fixtures =="
for f in shapes/*.ttl examples/positive/*.ttl examples/negative/*.ttl; do
  if "$PYTHON" -c "import sys, rdflib; g = rdflib.Graph(); g.parse(sys.argv[1], format='turtle'); print(f'{sys.argv[1]}: OK ({len(g)} triples)')" "$f"; then :; else
    echo "$f: PARSE FAILED" >&2; status=1
  fi
done

# The union shapes graph (same prefixes, disjoint shape IRIs).
cat shapes/*.ttl > "$tmp/shapes.ttl"

echo
echo "== Positive fixtures (MUST conform) =="
for ex in examples/positive/*.ttl; do
  [ -f "$ex" ] || continue
  echo "-- $ex"
  if $PYSHACL -s "$tmp/shapes.ttl" -df turtle -sf turtle --allow-warnings "$ex"; then :; else
    echo "  UNEXPECTED: positive fixture did NOT conform" >&2; status=1
  fi
done

echo
echo "== Negative fixtures (MUST be rejected) =="
for ex in examples/negative/*.ttl; do
  [ -f "$ex" ] || continue
  echo "-- $ex"
  set +e
  out="$($PYSHACL -s "$tmp/shapes.ttl" -df turtle -sf turtle --allow-warnings "$ex" 2>&1)"
  rc=$?
  set -e
  # Decide by the OUTPUT, not just the exit code: a non-zero exit could be a real
  # SHACL non-conformance or an unexpected tooling error, and blindly treating any
  # non-zero as "rejected" would hide a shape regression.
  if printf '%s' "$out" | grep -q "Conforms: False"; then
    echo "  OK: correctly rejected (SHACL Violation) —"
    printf '%s\n' "$out" | grep -E "Result Path|Message" | sed 's/^/     /' | head -6
  elif printf '%s' "$out" | grep -q "Conforms: True"; then
    echo "  REGRESSION: negative fixture CONFORMED but should have been rejected" >&2
    status=1
  else
    echo "  ERROR: validator errored (rc=$rc) without a clean rejection:" >&2
    printf '%s\n' "$out" | tail -3 >&2
    status=1
  fi
done

echo
if [ "$status" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit $status
