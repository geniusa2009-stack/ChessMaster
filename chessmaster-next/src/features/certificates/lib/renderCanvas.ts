"use client";
// Modern Dark Neon certificate renderer — ported from the legacy generateCertificate().
// It draws from an AUTHORITATIVE certificate record only (via buildCertificateView); the
// canvas is presentation/export, NEVER authority. The QR encodes the REAL /verify/<serial>
// URL (no fake domains).
import QRCode from "qrcode";
import { buildCertificateView, type AuthoritativeCert } from "@/features/certificates/lib/view";
import { buildVerifyUrl } from "@/features/certificates/lib/verifyUrl";
import { publicEnv } from "@/lib/env";

const W = 1600, H = 1200;

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, font: string, color: string, spacing: number) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "left";
  const widths: number[] = []; let total = 0;
  for (let i = 0; i < text.length; i++) { const w = ctx.measureText(text[i]).width; widths.push(w); total += w + (i < text.length - 1 ? spacing : 0); }
  let x = cx - total / 2;
  for (let j = 0; j < text.length; j++) { ctx.fillText(text[j], x, y); x += widths[j] + spacing; }
  ctx.textAlign = "center";
}

export async function renderCertificate(canvas: HTMLCanvasElement, cert: AuthoritativeCert): Promise<void> {
  const view = buildCertificateView(cert);
  const NEON = view.theme.color, GLOW = view.theme.glow;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  function neon(txt: string, x: number, y: number, font: string, fill: string, blur: number) {
    ctx!.save(); ctx!.font = font; ctx!.textAlign = "center"; ctx!.textBaseline = "alphabetic"; ctx!.fillStyle = fill;
    ctx!.shadowColor = GLOW; ctx!.shadowBlur = blur; ctx!.fillText(txt, x, y); if (blur > 0) ctx!.fillText(txt, x, y); ctx!.restore();
  }

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#070a10"); bg.addColorStop(0.5, "#0a0f17"); bg.addColorStop(1, "#05070c");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.028)"; ctx.lineWidth = 1;
  for (let x = 80; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, H - 80); ctx.stroke(); }
  for (let y = 80; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(W - 80, y); ctx.stroke(); }
  const vg = ctx.createRadialGradient(W / 2, H * 0.4, 80, W / 2, H * 0.5, H * 0.9);
  vg.addColorStop(0, GLOW.replace(/0\.\d+\)/, "0.10)")); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = NEON; ctx.shadowColor = GLOW; ctx.shadowBlur = 60; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "900px Georgia, serif"; ctx.fillText(view.theme.icon, W / 2, H / 2 + 40); ctx.restore();

  // frame + corner brackets
  ctx.strokeStyle = "#141a24"; ctx.lineWidth = 20; ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 26; ctx.strokeStyle = NEON; ctx.lineWidth = 3; ctx.strokeRect(70, 70, W - 140, H - 140); ctx.strokeRect(70, 70, W - 140, H - 140); ctx.restore();
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 16; ctx.strokeStyle = NEON; ctx.lineWidth = 5; const L = 70, m = 70;
  const C = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
  C.forEach((c) => { ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L); ctx.stroke(); });
  ctx.restore();

  // emblem
  ctx.save(); ctx.translate(W / 2, 196); ctx.shadowColor = GLOW; ctx.shadowBlur = 24; ctx.strokeStyle = NEON; ctx.lineWidth = 3.5;
  ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; const px = Math.cos(a) * 66, py = Math.sin(a) * 66; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill(); ctx.restore();
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 20; ctx.fillStyle = NEON; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "68px Georgia, serif"; ctx.fillText(view.theme.icon, W / 2, 200); ctx.restore();
  ctx.textBaseline = "alphabetic";

  // academy + rarity pill + title
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 12; drawSpaced(ctx, view.academy, W / 2, 322, "bold 26px Arial, sans-serif", NEON, 13); ctx.restore();
  ctx.font = "bold 22px Arial, sans-serif"; const pw = ctx.measureText(view.rarityLine).width + 56;
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 14; ctx.strokeStyle = NEON; ctx.lineWidth = 2; ctx.fillStyle = "rgba(255,255,255,0.03)";
  const px0 = W / 2 - pw / 2, py0 = 352, rr = 22;
  ctx.beginPath(); ctx.moveTo(px0 + rr, py0); ctx.arcTo(px0 + pw, py0, px0 + pw, py0 + 44, rr); ctx.arcTo(px0 + pw, py0 + 44, px0, py0 + 44, rr); ctx.arcTo(px0, py0 + 44, px0, py0, rr); ctx.arcTo(px0, py0, px0 + pw, py0, rr); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  neon(view.rarityLine, W / 2, py0 + 30, "bold 22px Arial, sans-serif", NEON, 10);
  neon(view.heading, W / 2, 470, "bold 60px Arial, sans-serif", "#ffffff", 8);
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 12; ctx.strokeStyle = NEON; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 310, 512); ctx.lineTo(W / 2 - 18, 512); ctx.moveTo(W / 2 + 18, 512); ctx.lineTo(W / 2 + 310, 512); ctx.stroke(); ctx.fillStyle = NEON; ctx.save(); ctx.translate(W / 2, 512); ctx.rotate(Math.PI / 4); ctx.fillRect(-7, -7, 14, 14); ctx.restore(); ctx.restore();

  // recipient + rank + description + date
  ctx.fillStyle = "#9fb0c2"; ctx.font = "italic 28px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("This certificate is proudly awarded to", W / 2, 588);
  neon(view.recipientName, W / 2, 700, "bold 96px Arial, sans-serif", "#ffffff", 18);
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 14; ctx.strokeStyle = NEON; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 400, 740); ctx.lineTo(W / 2 + 400, 740); ctx.stroke(); ctx.restore();
  ctx.fillStyle = "#c3d0dd"; ctx.font = "32px Arial, sans-serif"; ctx.fillText("for attaining the elite rank of", W / 2, 808);
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 16; drawSpaced(ctx, view.rankLine, W / 2, 872, "bold 50px Arial, sans-serif", NEON, 5); ctx.restore();
  ctx.fillStyle = "#8595a6"; ctx.font = "italic 26px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText(view.description, W / 2, 924);
  ctx.fillStyle = "#6f7d8c"; ctx.font = "23px Arial, sans-serif"; ctx.fillText("Date of Issue:  " + view.dateStr, W / 2, 978);

  // signature + footer
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 8; ctx.strokeStyle = NEON; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 190, 1058); ctx.lineTo(W / 2 + 190, 1058); ctx.stroke(); ctx.restore();
  ctx.fillStyle = "#e6edf4"; ctx.font = "italic 28px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Genius Ahmed Ibrahim", W / 2, 1094);
  ctx.fillStyle = "#6f7d8c"; ctx.font = "17px Arial, sans-serif"; ctx.fillText("Founder & Lead Architect", W / 2, 1120);
  ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "16px Arial, sans-serif";
  const f1 = "Developed with ", f2 = "♥", f3 = " by Genius Ahmed Ibrahim";
  const fw1 = ctx.measureText(f1).width, fw2 = ctx.measureText(f2).width; const fsx = W / 2 - (fw1 + fw2 + ctx.measureText(f3).width) / 2;
  ctx.fillStyle = "#7f8b98"; ctx.fillText(f1, fsx, 1158);
  ctx.fillStyle = NEON; ctx.shadowColor = GLOW; ctx.shadowBlur = 10; ctx.fillText(f2, fsx + fw1, 1158); ctx.shadowBlur = 0;
  ctx.fillStyle = "#7f8b98"; ctx.fillText(f3, fsx + fw1 + fw2, 1158); ctx.restore();

  // serial (bottom-left)
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#6f7d8c"; ctx.font = "18px 'Courier New', monospace"; ctx.fillText("ID: " + view.serial, 108, H - 52);

  // QR -> REAL verify URL (bottom-right)
  const verifyUrl = buildVerifyUrl(publicEnv.siteUrl, cert.serial);
  const qs = 160, qx = W - 250, qy = H - 290;
  ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 18; ctx.fillStyle = "#ffffff"; ctx.fillRect(qx - 14, qy - 14, qs + 28, qs + 48); ctx.restore();
  ctx.strokeStyle = NEON; ctx.lineWidth = 2; ctx.strokeRect(qx - 14, qy - 14, qs + 28, qs + 48);
  try {
    const dataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: qs, color: { dark: "#111116", light: "#ffffff" }, errorCorrectionLevel: "H" });
    await new Promise<void>((resolve) => { const img = new Image(); img.onload = () => { ctx.drawImage(img, qx, qy, qs, qs); resolve(); }; img.onerror = () => resolve(); img.src = dataUrl; });
  } catch { /* QR optional; verification still works via the printed ID */ }
  ctx.fillStyle = "#111116"; ctx.font = "bold 14px 'Courier New', monospace"; ctx.textAlign = "center"; ctx.fillText("SCAN TO VERIFY", qx + qs / 2, qy + qs + 22);

  if (view.revoked) {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 12);
    ctx.fillStyle = "rgba(229,90,90,0.85)"; ctx.font = "bold 160px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("REVOKED", 0, 60); ctx.restore();
  }
}
