#!/usr/bin/env bash
# Provision a real, ephemeral, local PostgreSQL and run the trigger/cascade tests
# against it (NOT Supabase). Downloads a self-contained Postgres binary (zonky
# embedded-postgres) into a gitignored cache on first run, inits a throwaway data
# dir, runs `node --test`, and tears the server down.
#
# Usage: from tests/local-pg/  ->  ./run.sh
# Requires `node`/`npm` on PATH (this repo has no system Node — put the project-
# local Node on PATH first, e.g. export PATH="/path/to/node-v20.../bin:$PATH").
set -euo pipefail
cd "$(dirname "$0")"

PGVER="16.2.0"
CACHE="$PWD/.pgcache"        # gitignored
DIST="$CACHE/dist"
DATA="$CACHE/pgdata"
SOCK="/tmp/bbpg-sock"        # kept short: PG socket paths max out at ~103 bytes
PORT="${PGPORT:-5433}"

# 1. Pick the zonky classifier for this OS/arch.
os="$(uname -s)"; arch="$(uname -m)"
case "$os/$arch" in
  Darwin/x86_64) CLASS="darwin-amd64";;
  Darwin/arm64)  CLASS="darwin-arm64v8";;
  Linux/x86_64)  CLASS="linux-amd64";;
  Linux/aarch64) CLASS="linux-arm64v8";;
  *) echo "Unsupported platform $os/$arch — add its zonky classifier."; exit 2;;
esac

# 2. Download + extract the Postgres binaries once.
if [ ! -x "$DIST/bin/postgres" ]; then
  echo "Fetching PostgreSQL $PGVER ($CLASS)…"
  mkdir -p "$CACHE" "$DIST"
  jar="$CACHE/pg.jar"
  curl -sSL -o "$jar" "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-$CLASS/$PGVER/embedded-postgres-binaries-$CLASS-$PGVER.jar"
  txz="$(unzip -Z1 "$jar" | grep -E '\.txz$' | head -1)"
  unzip -o -q "$jar" "$txz" -d "$CACHE"
  tar xf "$CACHE/$txz" -C "$DIST"
fi

# 3. Deps for the test (isolated to this dir).
[ -d node_modules ] || npm install --silent

# 4. Fresh data dir + server.
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
"$DIST/bin/initdb" -D "$DATA" -U postgres --no-locale -E UTF8 >/dev/null 2>&1
cleanup() { "$DIST/bin/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
"$DIST/bin/pg_ctl" -D "$DATA" -o "-k $SOCK -p $PORT -c listen_addresses=127.0.0.1" -w start >/dev/null

# 5. Run the tests.
PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres \
  node --test cascade_last_owner.test.mjs
