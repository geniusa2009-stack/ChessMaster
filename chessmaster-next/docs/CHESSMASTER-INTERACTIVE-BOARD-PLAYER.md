# ChessMaster Interactive Board Player

`src/features/campaign/components/BoardDemoPlayer.tsx` — reuses the existing Board (no second board).

## Modes
- **guided**: step through a validated move sequence (next/prev/replay/reset) with SAN + explanation; highlights + SVG arrows.
- **interactive**: the learner attempts a move; legality decided by the real rules (ChessGame.safeMove); illegal attempts are REJECTED and the board is unchanged (never a fake transition).

## Accessibility
Labeled controls, aria-live status, keyboard-usable buttons, fixed white-bottom orientation (RTL-safe), reduced-motion friendly (no autoplay).

## Security
Demos are client-safe teaching material (the move is the lesson). Puzzle solutions + assessment answers stay server-only; none are moved into demo metadata.
