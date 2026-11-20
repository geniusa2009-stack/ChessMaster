# Stockfish engine (self-hosted, pinned — no CDN)

The app prefers Stockfish and falls back to the built-in negamax engine if this file
is missing, so gameplay always works.

To enable Stockfish, copy the worker from the pinned npm package into this folder:

    npm run setup:engine

which runs: `cp node_modules/stockfish/src/stockfish.js public/engine/stockfish.js`

Pinned via the `stockfish` dependency in package.json (no @master, no CDN).
