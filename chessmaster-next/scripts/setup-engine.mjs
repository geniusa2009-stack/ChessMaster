import fs from "node:fs";
fs.mkdirSync("public/engine", { recursive: true });
const cand = ["node_modules/stockfish/src/stockfish.js", "node_modules/stockfish/stockfish.js"].find((f) => fs.existsSync(f));
if (cand) { fs.copyFileSync(cand, "public/engine/stockfish.js"); console.log("engine copied from " + cand); }
else { console.log("stockfish source not found; negamax fallback will be used"); }
