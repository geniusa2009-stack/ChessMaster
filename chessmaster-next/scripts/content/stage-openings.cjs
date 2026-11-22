// Private staging only. Does not publish content or award progress.
// Usage: node stage-openings.cjs SOURCE_CHECKOUT PRIVATE_OUTPUT_DIRECTORY
const { Chess } = require('chess.js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

async function write(stream, row) {
  if (!stream.write(JSON.stringify(row) + '\n')) await once(stream, 'drain');
}

async function main() {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error('Expected SOURCE_CHECKOUT PRIVATE_OUTPUT_DIRECTORY');
  const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) {
    throw new Error('Source checkout must be clean');
  }
  fs.mkdirSync(destination, { recursive: true });
  const staged = fs.createWriteStream(path.join(destination, 'openings.ndjson.tmp'), { mode: 0o600 });
  const quarantine = fs.createWriteStream(path.join(destination, 'quarantine.ndjson.tmp'), { mode: 0o600 });
  // Abort on write failure; never emit a successful report for truncated staging files.
  for (const stream of [staged, quarantine]) stream.on('error', error => { throw error; });
  const names = new Set(), families = new Set(), identities = new Set(), canonical = new Set();
  const licenseInformation = fs.existsSync(path.join(source, 'COPYING.txt'))
    ? fs.readFileSync(path.join(source, 'COPYING.txt'), 'utf8') : null;
  const report = { snapshot: revision, rightsReview: 'DEFERRED_TO_PROJECT_OWNER',
    collectionStatus: 'RIGHTS_REVIEW_PENDING', publicActivation: false,
    discovered: 0, stagedLegal: 0, quarantined: 0, exactDuplicates: 0, repeatedMoveLines: 0,
    acceptedIntoApplication: 0, sourceFiles: [], sourceProvidedLicenseInformation: licenseInformation,
    startedAt: new Date().toISOString() };
  for (const letter of 'abcde') {
    const file = `${letter}.tsv`;
    const bytes = fs.readFileSync(path.join(source, file));
    const checksum = hash(bytes);
    report.sourceFiles.push({ file, sha256: checksum, bytes: bytes.length });
    const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/);
    if (rows.shift() !== 'eco\tname\tpgn') throw new Error(`Unexpected schema: ${file}`);
    for (let index = 0; index < rows.length; index++) {
      report.discovered++;
      const columns = rows[index].split('\t');
      const [eco, name, pgn] = columns;
      const sourceId = hash(JSON.stringify(columns));
      const provenance = { sourceName: 'lichess-org/chess-openings',
        sourceUrl: `https://github.com/lichess-org/chess-openings/blob/${revision}/${file}`,
        sourceId, sourceIdKind: 'derived_sha256_of_original_columns',
        originalSourceId: null, snapshot: revision, sourceFileSha256: checksum,
        sourceRow: index + 2, originalMetadata: { eco, name, pgn },
        collectionStatus: 'RIGHTS_REVIEW_PENDING',
        licenseInformation, retrievalTimestamp: null };
      try {
        if (columns.length !== 3 || !/^[A-E][0-9]{2}$/.test(eco) || !name || !pgn) throw new Error('Malformed row');
        const game = new Chess();
        game.loadPgn(pgn, { strict: true });
        const moves = game.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
        if (!moves.length) throw new Error('Empty opening line');
        if (identities.has(sourceId)) {
          report.exactDuplicates++;
          throw new Error('Exact duplicate source row');
        }
        identities.add(sourceId);
        const key = moves.join(' ');
        if (canonical.has(key)) report.repeatedMoveLines++;
        canonical.add(key);
        names.add(name);
        families.add(name.split(':', 1)[0]);
        await write(staged, { id: `lichess-opening:${sourceId}`, eco, name, pgn,
          moves, finalFen: game.fen(), verification: 'legal_move_validation', provenance });
        report.stagedLegal++;
      } catch (error) {
        report.quarantined++;
        await write(quarantine, { provenance, raw: rows[index], reason: error.message });
      }
    }
  }
  for (const stream of [staged, quarantine]) {
    stream.end();
    await once(stream, 'finish');
  }
  report.distinctNames = names.size;
  report.familyNamePrefixes = families.size;
  report.namedVariations = [...names].filter(name => name.includes(':')).length;
  report.familyDerivation = 'Name prefix before colon; no artificial parent entries created';
  report.completedAt = new Date().toISOString();
  for (const file of ['openings.ndjson', 'quarantine.ndjson']) {
    fs.renameSync(path.join(destination, file + '.tmp'), path.join(destination, file));
  }
  fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
