# Global corpus tools

This collection is isolated from the production application. All content is marked
`RIGHTS_REVIEW_PENDING`. Rights review is `DEFERRED_TO_PROJECT_OWNER`.
There is no production activation or migration in this change.

## Current limits

This is a partial acquisition and consolidation run, stopped at local disk reserves.
The reports distinguish acquired records, normalized records, duplicate copies,
legal replay and finite-node engine analysis. No global uniqueness, exhaustive
worldwide discovery, or forced-objective verification is claimed.

The official Lichess puzzle archive and complete a–e opening snapshot were acquired.
All four published Chess.com repository release archives (v1/v2, JSON/CSV) were
acquired. Alternate formats and historical snapshots overlap: do not sum them
as unique puzzles. Chessy provides aggregate CSV/JSON cuts; its advertised full
opening count is not the number of downloaded opening lines.

Other acquired data includes Chinese broadcast shards and brilliancy detail
shards, Canadian games, national archives, Lucas training files, research labels
and a 100,000-position evaluation dataset. See the machine-readable audit for
actual per-file counts and incomplete retrieval plans.

HHdbVII requires a download code that was not available. ChessTempo returned HTTP
403. Lumbra's download route returned HTTP 403 and requires interactive download
controls. Composition API cursor requests were rejected with
`afterScore and afterId must be where a page of the walk ends`, including requests
formed from the endpoint's returned tail records. Saved composition pages lack
solution text. No access restrictions were bypassed.

The two measured large Lichess evaluation/monthly-game files alone total
53,481,991,726 compressed bytes. Full processing and other queued archives need
additional storage beyond those raw bytes. Near-position similarity, cross-source
puzzle equivalence and complete Chess.com normalization remain pending.

## Setup

Use Python 3.13 or later. Acquisition also requires curl; the old standalone
inventory script uses the zstd CLI. Run these tools with a private directory
outside **every Git checkout**:

```sh
python3 -m venv /path/to/private/corpus-venv
/path/to/private/corpus-venv/bin/pip install -r scripts/corpus/requirements.txt
export CHESSMASTER_CORPUS_ROOT=/path/to/private/chessmaster-global-corpus
export PYTHONPATH=/path/to/private/corpus-venv/lib/python3.13/site-packages
```

The provided download plans are metadata, not downloaded datasets. Copy the safe
plans into `$CHESSMASTER_CORPUS_ROOT/manifests/` before using them. Existing local
raw data, receipts, databases and checkpoints must move together to a larger disk.
Do not delete raw files to make room for normalized copies.

## Discovery, acquisition and resumption

```sh
python3 scripts/corpus/acquire.py inspect --plan docs/corpus/seed-sources.json
python3 scripts/corpus/acquire.py download --plan docs/corpus/bulk-plan.json
python3 scripts/corpus/acquire.py download --plan docs/corpus/china-bulk-plan.json
python3 scripts/corpus/acquire.py download --plan docs/corpus/games-remaining-plan.json
```

Re-run a plan to resume. Completed files are checksum-verified and reused. Partial
files require saved HTTP validators; servers that reject ranges do not silently
produce a successful acquisition. A payload becomes complete only after curl
succeeds, its known Content-Length agrees, and SHA-256 is recorded. Immutable
completed files are reused rather than overwritten. To acquire a newer snapshot,
use a new explicit filename/source snapshot. Do not reuse a completed name as an
update-in-place operation.

Download headroom is 1,200 MiB; puzzle normalization stops below 1,100 MiB and
other-domain processing below 900 MiB. An oversized file stays blocked while
smaller files may proceed. If no download headroom remains, subsequent plan items
stay pending. These are storage reserves, not record-count limits.

To add a source, append a source registry seed with a stable `source_id`, origin
URL, region, domain and retrieval method. Add concrete files to a JSON plan with
`source`, `url`, optional `name`, and `kind` (`data` or `inspection`). An inspected
web page never counts as an acquired dataset. Retain source-provided metadata
verbatim; the tools perform no rights approval.

## Processing and checkpoints

```sh
python3 scripts/corpus/consolidate.py --kind lichess --source lichess-puzzles \
  --file "$CHESSMASTER_CORPUS_ROOT/raw/lichess-puzzles/lichess_db_puzzle.csv.zst"
python3 scripts/corpus/domains.py
python3 scripts/corpus/special_domains.py
python3 scripts/corpus/evaluation_view.py
python3 scripts/corpus/count_files.py
python3 scripts/corpus/status.py
```

The puzzle importer uses 10,000-record immutable gzip shards and SQLite batch
transactions. SQLite batch rows are the authoritative checkpoint. A crash before
commit can leave an orphan shard; resumption replaces that shard and does not
trust it as committed work. Resume rereads the compressed input to its checkpoint
without repeating committed normalization. Source file SHA-256 pins each run.
The legal first setup move is applied to Lichess positions; the remaining source
solution is kept server/private-side and marked `legal_pending`.

Other domains commit every 1,000 records and resume incomplete files using
`file_progress`. Raw metadata and source references survive normalization and
quarantine. Opening names and move paths stay distinct; identical final positions
link transpositions. Games retain PGN variations, comments, headers and variants.
Composition genres and stipulations stay separate. Source engine analysis is
stored as source evidence, not represented as local verification.

Evaluation records remain in immutable Parquet. `evaluations.duckdb` exposes a
typed view joined to source URL, checksum and retrieval timestamp, avoiding a
second copy of 100,000 rows. Rebuild the view after moving the corpus directory.
The source evaluation values are preserved without relabelling them as puzzles.

## Private queries

```sh
python3 scripts/corpus/corpus_query.py --domain openings --text Sicilian --limit 20
python3 scripts/corpus/corpus_query.py --domain games --after CANONICAL_CURSOR
python3 scripts/corpus/corpus_query.py --puzzle CANONICAL_SHA256
```

The CLI is local and can show answer keys. Do not expose it as a public API.
Puzzle lookup uses the hash index and reads at most one 10,000-record shard.
Domain queries use stable keyset cursors with at most 100 returned records.

## Local analysis

The run installed official Stockfish 19 and Popeye MacOS ARM v4.103 in private
`extracted/` directories. Checksums and smoke-test output are preserved locally.
Small 3-man Syzygy tables were acquired and successfully probed; they do not
constitute complete 4–7-man coverage. Hardware: 8 logical CPUs, 8 GiB RAM.

```sh
python3 scripts/corpus/analyze.py --stage legal --seconds 60
python3 scripts/corpus/analyze.py --stage fast --seconds 60 --nodes 50000
# Omit --seconds to drain available committed puzzle work.
```

Jobs have durable leases, three-attempt retry isolation and configuration hashes.
Completed analysis with the same engine/configuration is reused. Changed engine
binaries or node budgets receive a separate analysis identity. Stockfish uses
one thread, 32 MiB hash and up to three PVs. Depth, nodes, PV and score are recorded.
A finite-node comparison is not proof of a forced objective or a unique solution.
Popeye passed a mate-in-one smoke test; no composition batch has been verified.
Tablebase probes record missing material dependencies rather than invent results.

## Verification and publication

```sh
python3 scripts/corpus/test_corpus.py
python3 -m py_compile scripts/corpus/*.py
```

Tests cover setup-move semantics, idempotent resume, preserving duplicate sources,
transposition paths and rejection of illegal opening moves. The live run also
exercised full archive parsing, strict opening replay, database queries, local
engines and a real interrupted/resumed puzzle import.

Only tools, plans, source registry, schemas and sanitized reports belong in Git.
Never add raw archives, extracted datasets, raw HTTP responses, local SQLite/
DuckDB databases, engine binaries, answer keys or credentials. Production auth,
XP, ratings, certificates, curriculum and existing content were not modified.
