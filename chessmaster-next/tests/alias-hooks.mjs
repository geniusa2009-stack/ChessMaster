import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

const SRC = pathResolve(process.cwd(), "src");

export async function resolve(specifier, context, next) {
  // Node has no "server-only" package (it is a Next.js bundler marker). In tests it is a no-op so
  // *.server.ts modules can be unit-tested; it still prevents client bundling under Next.
  if (specifier === "server-only") return { url: "data:text/javascript,export default {}", shortCircuit: true };
  // "next/server" needs Next's bundler resolver; in tests we stub a minimal NextResponse so route
  // modules import cleanly and route handlers can be invoked directly (only .json is used here).
  if (specifier === "next/server") {
    const mod = "export const NextResponse={json:(body,init)=>({status:(init&&init.status)||200,_body:body,json:async()=>body,headers:new Map()})};export default {NextResponse};";
    return { url: "data:text/javascript," + encodeURIComponent(mod), shortCircuit: true };
  }
  if (specifier === "next/headers") {
    const mod = "export const cookies=async()=>({get:()=>undefined,getAll:()=>[],set:()=>{}});export const headers=async()=>new Map();";
    return { url: "data:text/javascript," + encodeURIComponent(mod), shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    let p = pathResolve(SRC, specifier.slice(2));
    if (!existsSync(p)) {
      if (existsSync(p + ".ts")) p += ".ts";
      else if (existsSync(p + ".tsx")) p += ".tsx";
      else if (existsSync(p + "/index.ts")) p += "/index.ts";
    }
    return next(pathToFileURL(p).href, context);
  }
  return next(specifier, context);
}
