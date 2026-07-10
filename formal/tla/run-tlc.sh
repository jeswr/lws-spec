#!/bin/sh
# AUTHORED-BY Claude Fable 5
#
# formal/tla/run-tlc.sh — model-check every JLWS TLA+ model against its
# EXPECTED TLC outcome. Some configs are counterexample witnesses: they are
# supposed to be violated (that is the point — TLC exhibiting the trace the
# spec text forbids or the predecessor text permitted), so this runner
# asserts the exact expected verdict per config rather than "all green".
#
# Requirements: java 11+ on PATH, and tla2tools.jar — either
#   * TLA_TOOLS_JAR=/path/to/tla2tools.jar (preferred: your own copy), or
#   * a tla2tools.jar next to this script, or
#   * network access: the jar is downloaded once into .cache/ and verified
#     against the pinned sha256 below (fail-closed on mismatch; the v1.8.0
#     GitHub artifact is a rolling pre-release, so a mismatch means the
#     upstream jar moved — verify it yourself and pass TLA_TOOLS_JAR, or
#     override LWS_TLC_SHA256 deliberately).
#
# Verified toolchain: TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802).
set -u

DIR=$(cd "$(dirname "$0")" && pwd)
JAR_URL="https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
JAR_SHA256="${LWS_TLC_SHA256:-936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88}"

die() { echo "run-tlc: $*" >&2; exit 2; }

command -v java >/dev/null 2>&1 || die "java 11+ is required (e.g. brew install openjdk)"

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else die "need shasum or sha256sum to verify tla2tools.jar"; fi
}

resolve_jar() {
  if [ -n "${TLA_TOOLS_JAR:-}" ]; then
    [ -f "$TLA_TOOLS_JAR" ] || die "TLA_TOOLS_JAR=$TLA_TOOLS_JAR does not exist"
    JAR="$TLA_TOOLS_JAR"; return
  fi
  if [ -f "$DIR/tla2tools.jar" ]; then JAR="$DIR/tla2tools.jar"; return; fi
  JAR="$DIR/.cache/tla2tools.jar"
  if [ ! -f "$JAR" ]; then
    mkdir -p "$DIR/.cache"
    echo "run-tlc: downloading tla2tools.jar (pinned sha256 $JAR_SHA256)"
    curl -fsSL -o "$JAR.tmp" "$JAR_URL" || die "download failed; set TLA_TOOLS_JAR"
    mv "$JAR.tmp" "$JAR"
  fi
  actual=$(sha256_of "$JAR")
  if [ "$actual" != "$JAR_SHA256" ]; then
    rm -f "$JAR"
    die "tla2tools.jar sha256 mismatch (got $actual): the rolling upstream artifact moved — verify a copy yourself and pass TLA_TOOLS_JAR, or override LWS_TLC_SHA256"
  fi
}

resolve_jar
echo "run-tlc: using $JAR"

FAILURES=0
CASES=0

# run <module.tla> <config.cfg> <expectation>
#   expectation: pass | violates:<PropertyName>
run() {
  module=$1; cfg=$2; expect=$3
  CASES=$((CASES + 1))
  meta="${TMPDIR:-/tmp}/lws-tlc-$$-$CASES"
  out=$(cd "$DIR" && java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
          -config "$cfg" -metadir "$meta" "$module" 2>&1)
  status=$?
  rm -rf "$meta"
  case "$expect" in
    pass)
      if [ $status -eq 0 ] && printf '%s' "$out" | grep -q "No error has been found"; then
        echo "OK    $cfg — pass (as expected)"
      else
        echo "FAIL  $cfg — expected pass; TLC exit $status"
        printf '%s\n' "$out" | grep -E "Error|violated" | head -5
        FAILURES=$((FAILURES + 1))
      fi
      ;;
    violates:*)
      prop=${expect#violates:}
      if [ $status -ne 0 ] && printf '%s' "$out" \
           | grep -Eq "(Invariant|Action property|Temporal property) $prop is violated"; then
        echo "OK    $cfg — violates $prop (the expected counterexample)"
      else
        echo "FAIL  $cfg — expected a violation of $prop; TLC exit $status"
        printf '%s\n' "$out" | grep -E "Error|violated|No error" | head -5
        FAILURES=$((FAILURES + 1))
      fi
      ;;
    *) die "unknown expectation '$expect'" ;;
  esac
}

# --- the expectation table (keep in sync with README.md) --------------------
run JlwsRevocation.tla        JlwsRevocation.cfg                       pass
run JlwsRevocation.tla        JlwsRevocation-window.cfg                violates:NoOracleWindow
run JlwsRevocation.tla        JlwsRevocation-ackwindow.cfg             violates:NoUseAfterAckedRevocation
run JlwsRevocation.tla        JlwsRevocation-naive.cfg                 violates:NaiveRevocationDenies
run JlwsConditionalUpdate.tla JlwsConditionalUpdate.cfg                pass
run JlwsConditionalUpdate.tla JlwsConditionalUpdate-unconditional.cfg  violates:NoLostUpdate
run JlwsContainment.tla       JlwsContainment.cfg                      pass
run JlwsContainment.tla       JlwsContainment-split.cfg                violates:MembershipExact

echo
if [ $FAILURES -eq 0 ]; then
  echo "run-tlc: all $CASES model-check expectations hold"
else
  echo "run-tlc: $FAILURES of $CASES expectations FAILED" >&2
  exit 1
fi
