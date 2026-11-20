#!/usr/bin/env bash
# R7.3.2.1 reproducible REAL PostgreSQL concurrency run. Boots a DISPOSABLE PostgreSQL instance from
# the `embedded-postgres` npm binary (no root, no system install, no production contact), creates an
# isolated `cm_test` database, runs scripts/pg-concurrency-test.mjs against it (separate connections +
# a barrier), then stops and discards the instance. `pg` + `embedded-postgres` are installed into a
# throwaway dir ($PG_TMP) so the project has no new dependency.
set -euo pipefail
PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PG_TMP="${PG_TMP:-/tmp/pgsetup/pgnpm}"
PGPORT="${PGPORT:-54329}"; PGSOCK="${PGSOCK:-/tmp/pgrun}"; PGDATA="${PGDATA:-/tmp/pgdata}"

if [ ! -d "$PG_TMP/node_modules/@embedded-postgres" ]; then
  mkdir -p "$PG_TMP"; ( cd "$PG_TMP" && npm init -y >/dev/null 2>&1 && npm install embedded-postgres pg >/dev/null 2>&1 )
fi
ARCH_DIR="$(ls -d "$PG_TMP"/node_modules/@embedded-postgres/*/native 2>/dev/null | head -1)"
export LD_LIBRARY_PATH="$ARCH_DIR/lib"
export PG_REQUIRE_BASE="$PG_TMP/package.json"
BIN="$ARCH_DIR/bin"

cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
rm -rf "$PGDATA" "$PGSOCK"; mkdir -p "$PGSOCK"
"$BIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/tmp/initdb.log 2>&1
"$BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $PGSOCK -c listen_addresses=''" -l /tmp/pg.log -w start >/dev/null 2>&1
node -e "const{Client}=require('$PG_TMP/node_modules/pg');(async()=>{const c=new Client({host:'$PGSOCK',port:$PGPORT,user:'postgres',database:'postgres'});await c.connect();await c.query('drop database if exists cm_test');await c.query('create database cm_test');await c.end();})()"
# The alias loader lets the harness import the SHARED production persistence module via "@/…" (and stubs
# server-only); strip-types lets it load the .ts source. `pg` is still resolved from the throwaway dir.
PGHOST="$PGSOCK" PGPORT="$PGPORT" node \
  --import "$PROJ_DIR/tests/register-alias.mjs" --experimental-strip-types \
  "$PROJ_DIR/scripts/pg-concurrency-test.mjs"
