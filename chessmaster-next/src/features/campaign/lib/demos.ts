// R7.1 board demonstrations for the CH02 pilot (Check & Checkmate Recognition). PROJECT-AUTHORED
// ILLUSTRATIVE teaching positions — NOT production puzzles (no puzzle id, not counted toward the
// corpus, no hidden solution). Each is validated by chess.js in tests/campaign-demos.test.ts: the
// FEN is legal, SAN and UCI agree, and the claimed result actually holds. Client-safe teaching
// diagrams (the demonstrated move IS the lesson — nothing secret).
export type DemoResult = "checkmate" | "check_not_mate" | "check_escapable";

export interface BoardDemo {
  id: string; videoId: string; levelId: string; objective: string;
  fen: string; move: { uci: string; san: string }; sideToMove: "w" | "b";
  highlight: string[]; arrows: Array<[string, string]>; result: DemoResult;
  observe: string; conclusion: string; provenance: "project_authored";
}

const pa = "project_authored" as const;

export const CH02_DEMOS: BoardDemo[] = [
  {
    id: "DEMO-CH02-01", videoId: "V-CH02-CONCEPT", levelId: "CH02-L001",
    objective: "A check is not mate when the king can simply walk away.",
    fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
    move: { uci: "a1a8", san: "Ra8+" }, sideToMove: "w",
    highlight: ["a8", "d7", "e7", "f7"], arrows: [["a1", "a8"]], result: "check_escapable",
    observe: "The rook checks along the 8th rank, but d7, e7 and f7 are all free for the king.",
    conclusion: "First question for any check: can the king escape? If yes, it is only a check.", provenance: pa,
  },
  {
    id: "DEMO-CH02-02", videoId: "V-CH02-CONCEPT", levelId: "CH02-L001",
    objective: "A check is not mate when the checking piece can be captured.",
    fen: "4k3/8/8/8/8/8/8/4Q1K1 w - - 0 1",
    move: { uci: "e1e7", san: "Qe7+" }, sideToMove: "w",
    highlight: ["e7", "e8"], arrows: [["e1", "e7"]], result: "check_not_mate",
    observe: "The queen checks from e7, but it is undefended — the black king just plays Kxe7.",
    conclusion: "Before calling a check 'mate', check whether the checking piece can be captured.", provenance: pa,
  },
  {
    id: "DEMO-CH02-03", videoId: "V-CH02-DEMO", levelId: "CH02-L002",
    objective: "Deliver a back-rank checkmate — the king is walled in by its own pawns.",
    fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1",
    move: { uci: "e1e8", san: "Re8#" }, sideToMove: "w",
    highlight: ["e8", "g8", "f7", "g7", "h7"], arrows: [["e1", "e8"]], result: "checkmate",
    observe: "The rook checks on the back rank; f7/g7/h7 are blocked by Black's own pawns.",
    conclusion: "Back-rank mate: a heavy piece checks on the last rank and the king's pawns trap it.", provenance: pa,
  },
  {
    id: "DEMO-CH02-04", videoId: "V-CH02-DEMO", levelId: "CH02-L002",
    objective: "Deliver a mate where the attacking king removes every escape square (box mate).",
    fen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 1",
    move: { uci: "a1a8", san: "Ra8#" }, sideToMove: "w",
    highlight: ["a8", "f7", "g7", "h7", "f8", "h8"], arrows: [["a1", "a8"]], result: "checkmate",
    observe: "The rook checks on the 8th rank; the white king on g6 covers f7, g7 and h7.",
    conclusion: "A rook mates only when the enemy king's flight squares are also covered — here by the king.", provenance: pa,
  },
  {
    id: "DEMO-CH02-05", videoId: "V-CH02-REVIEW", levelId: "CH02-L007",
    objective: "Boss-style: find the mate in one and confirm there is no escape or capture.",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1",
    move: { uci: "d1d8", san: "Qd8#" }, sideToMove: "w",
    highlight: ["d8", "g8", "f7", "g7", "h7"], arrows: [["d1", "d8"]], result: "checkmate",
    observe: "The queen reaches the back rank with check; the king is boxed in by f7/g7/h7.",
    conclusion: "Same back-rank idea with the queen — always verify no escape, block or capture before calling mate.", provenance: pa,
  },
];

export function demosForVideo(videoId: string): BoardDemo[] { return CH02_DEMOS.filter((d) => d.videoId === videoId); }
