"""Inventory complete local official snapshots without claiming chess validation.

Python stdlib + zstd CLI. Raw archives and local state must live outside Git.
This is a preflight inventory, not the application importer.
"""
import argparse
import csv
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inventory(puzzles, openings):
    started = time.monotonic()
    retrieved = datetime.now(timezone.utc).isoformat()
    revision = subprocess.check_output(
        ["git", "-C", str(openings), "rev-parse", "HEAD"], text=True
    ).strip()
    if subprocess.check_output(
        ["git", "-C", str(openings), "status", "--porcelain"], text=True
    ).strip():
        raise ValueError("Opening checkout must be clean to identify the snapshot")
    opening_files = []
    families, names, lines = set(), set(), set()
    opening_count = 0
    for letter in "abcde":
        path = openings / (letter + ".tsv")
        count = 0
        with path.open(newline="", encoding="utf-8") as source:
            reader = csv.DictReader(source, delimiter="\t")
            if reader.fieldnames != ["eco", "name", "pgn"]:
                raise ValueError(f"Unexpected opening schema: {path}")
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError(f"Malformed opening row: {path}:{reader.line_num}")
                count += 1
                names.add(row["name"])
                families.add(row["name"].split(":", 1)[0])
                lines.add(row["pgn"])
        opening_count += count
        opening_files.append({
            "source_url": f"https://github.com/lichess-org/chess-openings/blob/{revision}/{letter}.tsv",
            "sha256": checksum(path), "bytes": path.stat().st_size,
            "records": count,
        })
    puzzle_sha = checksum(puzzles)
    process = subprocess.Popen(
        ["zstd", "-dc", str(puzzles)], stdout=subprocess.PIPE, text=True,
        encoding="utf-8", bufsize=1024 * 1024,
    )
    count, malformed = 0, 0
    fields = None
    try:
        reader = csv.DictReader(process.stdout)
        fields = reader.fieldnames
        required = {"PuzzleId", "FEN", "Moves", "Rating", "Themes", "GameUrl"}
        if not required.issubset(fields or []):
            raise ValueError("Unexpected puzzle CSV schema")
        for row in reader:
            count += 1
            if None in row or any(value is None for value in row.values()):
                malformed += 1
            if count % 100000 == 0:
                print(f"Inventoried {count:,} puzzle records", flush=True)
        process.stdout.close()
        if process.wait() != 0:
            raise RuntimeError("Archive decompression failed; inventory is incomplete")
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
    elapsed = time.monotonic() - started
    return {
        "status": "PARTIALLY COMPLETE — TECHNICAL WORK REMAINS",
        "rights_review": "DEFERRED_TO_PROJECT_OWNER",
        "collection_status": "RIGHTS_REVIEW_PENDING",
        "public_activation": False,
        "inventoried_at": retrieved,
        "retrieval_timestamp": None,
        "retrieval_timestamp_note": "Record separately at acquisition; inventory time is not retrieval time.",
        "puzzles": {
            "source_name": "Lichess Open Puzzle Database",
            "source_url": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
            "snapshot_identity": "sha256:" + puzzle_sha,
            "source_id_field": "PuzzleId",
            "sha256": puzzle_sha, "compressed_bytes": puzzles.stat().st_size,
            "source_fields": fields,
            "records_downloaded": count, "records_inventoried": count,
            "malformed_csv_records": malformed,
            "records_chess_validated": 0, "records_accepted": 0,
            "records_quarantined": 0, "records_rejected": 0,
            "records_awaiting_validation": count,
        },
        "openings": {
            "source_name": "lichess-org/chess-openings",
            "source_url": "https://github.com/lichess-org/chess-openings",
            "snapshot": revision, "files": opening_files,
            "records_downloaded": opening_count,
            "distinct_names": len(names), "distinct_pgn_lines": len(lines),
            "family_name_prefixes": len(families),
            "named_variations": sum(":" in name for name in names),
            "family_derivation": "Name prefix before colon; not a source-defined family hierarchy",
            "records_chess_validated": 0, "records_accepted": 0,
            "records_awaiting_validation": opening_count,
        },
        "inventory_seconds": round(elapsed, 3),
        "puzzle_inventory_records_per_second": round(count / elapsed, 2),
        "production_storage_bytes": None,
        "blockers": [
            "No connected Supabase project or database credentials; capacity is unknown.",
            "Application importer, chess validation, deduplication, activation gate and trainer integration remain unimplemented.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--puzzles", type=Path, required=True)
    parser.add_argument("--openings", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = inventory(args.puzzles, args.openings)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.report.with_suffix(args.report.suffix + ".tmp")
    temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.report)
    print(json.dumps(report, indent=2))
