// ============ 2.5D RENDERER for game.html (lifted from thunderhead-play.html) ============
// The greybox's physics and rules stay exactly where they are; this file only
// draws them from a raised camera. It reads the same GEO/S/R/BOWLS/DECKS/RAMPS
// the flat renderer reads and never writes any of it. Toggle with V, or
// ?view=25d. If anything in here throws, render() falls back to the flat view
// for that frame rather than taking the game down.
//
// Lifted verbatim where the old art build already had the answer (camera,
// prisms, shadows, rails, flippers, the HERO bumper bake Ian kept), and written
// fresh for the hardware that build never had: the funnels, the canopy with
// its pegs and hole, the lock rims, rollovers, the eyes.

const R25 = { ready: false, CW: 1080, CH: 1920, SC: 1, SS: 1.5, fps: 0 };   // SS: static layer supersample
// LOW-FX PATH (Ian's Pixel, 2026-09-13: "slide show level performance"). The
// live layer ran 35-45 ctx.filter blur passes a frame (soft shadows under every
// moving part, lamp glows) --- fine on a desktop GPU, a slideshow on a phone.
// Low FX: flat offset shadows, gradient glows instead of blurred fills, no
// static-layer supersample, pixel ratio capped at 2. Auto on touch devices and
// high-DPR screens; ?fx=high / ?fx=low override; X toggles at runtime.
const FX = { low: (() => { const q = new URLSearchParams(location.search).get('fx'); if (q) return q === 'low';
  return ('ontouchstart' in window) || (devicePixelRatio || 1) > 1.75; })() };
R25.SS = FX.low ? 1 : 1.5;
let TW = 953, TH = 1976;
let CAM, TGT, FWD, RIGHT = { x: 1, y: 0, z: 0 }, UP;
const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vnorm = v => { const d = Math.hypot(v.x, v.y, v.z); return { x: v.x / d, y: v.y / d, z: v.z / d }; };
const vcross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
let PF = 1500, POX = 0, POY = 0, PSCX = 1, PSCY = 1;
function projRaw(x, y, z) {
  const d = vsub({ x, y, z }, CAM);
  const w = vdot(d, FWD);
  return { x: PF * vdot(d, RIGHT) / w, y: -PF * vdot(d, UP) / w, w };
}
function proj(x, y, z) {
  const r = projRaw(x, y, z);
  return { x: r.x * PSCX + POX, y: r.y * PSCY + POY, w: r.w };
}
const HUD_H = 120;   // screen-space strip under the table for score/balls/storm/locks
// PHONE LAYOUT (Ian's Pixel, 2026-09-13: "needs to be full screen"). On a phone
// the frame is as tall as the screen (CW 1080 x CH from the viewport aspect);
// the table keeps its desktop proportions (at most 10% taller) and the spare
// height becomes a score bar above and a control bar below, with flipper
// buttons --- the layout every phone pinball game uses. Desktop is unchanged.
const LAYOUT = { top: 0, bottom: HUD_H, tableH: 1920 - HUD_H };
function applyLayout(CH, phone) {
  if (!phone) { LAYOUT.top = 0; LAYOUT.bottom = HUD_H; }
  else { LAYOUT.top = 150; const avail = CH - 150 - 260; const tableH = Math.min(avail, 1800 * 1.10); LAYOUT.bottom = CH - 150 - tableH; }
  LAYOUT.tableH = CH - LAYOUT.top - LAYOUT.bottom;
  MUSBTN.y = CH - LAYOUT.bottom + (phone ? 40 : 52);
}
const MUSBTN = { x: 540, y: 1920 - HUD_H + 52, r: 30 };   // the music note, centre of the strip (canvas 1080x1920)
function setupCamera(W, H) {
  TW = W; TH = H;
  const CW = R25.CW, CH = R25.CH;
  TGT = { x: W / 2, y: H / 2, z: 0 };
  const k = H / 1200;
  CAM = { x: W / 2, y: H / 2 + 1180 * k, z: 1750 * k };
  FWD = vnorm(vsub(TGT, CAM));
  UP = vcross(FWD, RIGHT);
  // Fit the playfield AND the cabinet back wall's top edge: the wall is
  // extruded outward past y=0 and stands 74 high, and fitting the print
  // alone put its top face at canvas y-51 --- clipped clean off (Ian, 2026-09-11:
  // "still no top wall?").
  const pts = [projRaw(0, H, 0), projRaw(W, H, 0), projRaw(0, 0, 0), projRaw(W, 0, 0),
               projRaw(-BACK_WALL.depth, -BACK_WALL.depth, BACK_WALL.z), projRaw(W + BACK_WALL.depth, -BACK_WALL.depth, BACK_WALL.z),
               projRaw(-BACK_WALL.depth, H, BACK_WALL.z), projRaw(W + BACK_WALL.depth, H, BACK_WALL.z)];
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  PSCX = (CW - 24) / (maxX - minX);
  // the HUD lives in a strip BELOW the table (Ian, 2026-09-11: "move it to the
  // bottom" --- top-left it sat on the back wall); the table fits above it
  applyLayout(CH, !!R25.phone);
  PSCY = (LAYOUT.tableH - 36) / (maxY - minY);
  POX = CW / 2 - (minX + maxX) / 2 * PSCX;
  POY = LAYOUT.top + 16 - minY * PSCY;
}
const L = vnorm({ x: 0.42, y: 0.30, z: -0.86 });
function shOff(z) { return { dx: z * (L.x / L.z) * -1, dy: z * (L.y / L.z) * -1 }; }
function faceLight(nx, ny) { return 0.55 + 0.45 * Math.max(0, -(nx * L.x + ny * L.y)); }
const TOP_LIGHT = 0.55 + 0.45 * Math.max(0, -L.z * -1);
function shade(hex, k) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function pathPoly(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
function circlePts(cxw, cyw, z, r, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(proj(cxw + r * Math.cos(a), cyw + r * Math.sin(a), z)); }
  return pts;
}
function circle3(ctx, cxw, cyw, z, r, n = 28) { pathPoly(ctx, circlePts(cxw, cyw, z, r, n)); }
const SPEC = { tint: '200,216,238', side: 0.35 };
// Ramp deck and canopy opacity. Ian, 2026-09-11: "the ramp structure and canopy
// [should] stand out more... it's too translucent" --- deck 0.34 -> 0.62, canopy
// top 0.26 -> 0.55, canopy sides 0.10-0.22 -> 0.34-0.62. The ball and bumpers
// under the canopy are still seen through it, dimmer.
const RAMP_DECK_A = 0.62;
const CANOPY_A = { top: 0.55, side: 0.34, sideLit: 0.28 };
function prism(ctx, fp, z0, z1, color, topColor) {
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const nd = Math.hypot(nx, ny) || 1; nx /= nd; ny /= nd;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (nx * (CAM.x - mx) + ny * (CAM.y - my) <= 0) continue;
    const p = [proj(a[0], a[1], z0), proj(b[0], b[1], z0), proj(b[0], b[1], z1), proj(a[0], a[1], z1)];
    ctx.fillStyle = shade(color, faceLight(nx, ny));
    pathPoly(ctx, p); ctx.fill();
    const g = ctx.createLinearGradient(p[0].x, p[0].y, p[3].x, p[3].y);
    g.addColorStop(0, 'rgba(10,8,16,0.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.fillStyle = shade(topColor || color, TOP_LIGHT + 0.35);
  pathPoly(ctx, fp.map(p => proj(p[0], p[1], z1))); ctx.fill();
}
function prismShadowP(ctx, fp, z1, alpha = 0.3) {
  if (FX.low) {   // one flat offset polygon, no filter
    const o = shOff(z1 * 0.7);
    ctx.save(); ctx.fillStyle = `rgba(4,3,8,${(alpha * 0.55).toFixed(3)})`;
    pathPoly(ctx, fp.map(p => proj(p[0], p[1], 0)).concat(fp.slice().reverse().map(p => proj(p[0] + o.dx, p[1] + o.dy, 0)))); ctx.fill(); ctx.restore();
    return;
  }
  for (const [k, blur, al] of [[0.5, 4, alpha * 0.6], [1.0, 12, alpha * 0.35]]) {
    const o = shOff(z1 * k);
    ctx.save(); ctx.filter = `blur(${blur}px)`; ctx.fillStyle = `rgba(4,3,8,${al})`;
    const pts = fp.map(p => proj(p[0], p[1], 0)).concat(fp.slice().reverse().map(p => proj(p[0] + o.dx, p[1] + o.dy, 0)));
    pathPoly(ctx, pts); ctx.fill(); ctx.restore();
  }
}

// ---------- rails ----------
function rampRailSeg(ctx, a, b, halfW, railH, sideColor, topColor) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const px = -dy / d, py = dx / d;
  for (const s of [1, -1]) {
    const ax = a.x + px * halfW * s, ay = a.y + py * halfW * s;
    const bx = b.x + px * halfW * s, by = b.y + py * halfW * s;
    const nx = px * s, ny = py * s;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (nx * (CAM.x - mx) + ny * (CAM.y - my) <= 0) continue;
    const p = [proj(ax, ay, a.z), proj(bx, by, b.z), proj(bx, by, b.z + railH), proj(ax, ay, a.z + railH)];
    ctx.fillStyle = shade(sideColor, faceLight(nx, ny));
    pathPoly(ctx, p); ctx.fill();
  }
  ctx.save(); ctx.strokeStyle = shade(topColor, TOP_LIGHT + 0.3); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  for (const s of [1, -1]) {
    const ax = a.x + px * halfW * s, ay = a.y + py * halfW * s;
    const bx = b.x + px * halfW * s, by = b.y + py * halfW * s;
    const pa = proj(ax, ay, a.z + railH), pb = proj(bx, by, b.z + railH);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.restore();
}
function rampDeck(ctx, a, b, halfW, alpha) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const px = -dy / d, py = dx / d;
  const p = [
    proj(a.x + px * halfW, a.y + py * halfW, a.z), proj(b.x + px * halfW, b.y + py * halfW, b.z),
    proj(b.x - px * halfW, b.y - py * halfW, b.z), proj(a.x - px * halfW, a.y - py * halfW, a.z)];
  ctx.fillStyle = `rgba(${SPEC.tint},${alpha})`;
  pathPoly(ctx, p); ctx.fill();
}
function rampShadow(ctx, a, b, halfW) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const px = -dy / d, py = dx / d;
  const o1 = shOff(a.z), o2 = shOff(b.z);
  ctx.save(); ctx.filter = 'blur(6px)'; ctx.fillStyle = 'rgba(4,3,8,0.35)';
  const p = [
    proj(a.x + px * halfW + o1.dx, a.y + py * halfW + o1.dy, 0), proj(b.x + px * halfW + o2.dx, b.y + py * halfW + o2.dy, 0),
    proj(b.x - px * halfW + o2.dx, b.y - py * halfW + o2.dy, 0), proj(a.x - px * halfW + o1.dx, a.y - py * halfW + o1.dy, 0)];
  pathPoly(ctx, p); ctx.fill(); ctx.restore();
}
function drawRamps25(ctx) {
  const HALFW = 26, RAILH = 20;   // rails 16 -> 20: more structure (Ian, 2026-09-11)
  for (const r of RAMPS) {
    const pts = r.pts;
    const last = pts.length - 2, end = pts[pts.length - 1];
    const landsOnDeck = DECKS.some(d => pointInPoly(end.x, end.y, d.pts));
    for (let i = 0; i + 1 < pts.length; i++) if (!(landsOnDeck && i === last)) rampShadow(ctx, pts[i], pts[i + 1], HALFW);
    for (let i = 0; i + 1 < pts.length; i++) rampDeck(ctx, pts[i], pts[i + 1], HALFW, RAMP_DECK_A);
    // the landing: a ramp that ends on a deck lowers its rails over the last segment
    for (let i = 0; i + 1 < pts.length; i++) rampRailSeg(ctx, pts[i], pts[i + 1], HALFW, (landsOnDeck && i === last) ? RAILH * 0.4 : RAILH, '#8593a8', '#fff2cf');
  }
}

// ---------- the printed playfield, on the perspective plane ----------
let pfc = null;
function drawPlayfieldPersp(ctx) {
  ctx.save();
  pathPoly(ctx, [proj(0, 0, 0), proj(TW, 0, 0), proj(TW, TH, 0), proj(0, TH, 0)]);
  ctx.clip();
  // Each strip of a perspective-mapped plane is a trapezoid; a canvas affine
  // can only draw a parallelogram, so each strip is built from the AVERAGE of
  // its true top and bottom edges and centred, which splits the error evenly
  // instead of piling it on the right edge. Baked once, so 420 strips is free.
  const STRIPS = 420;
  for (let i = 0; i < STRIPS; i++) {
    const ty0 = i / STRIPS * TH, ty1 = (i + 1) / STRIPS * TH;
    const tl = proj(0, ty0, 0), tr = proj(TW, ty0, 0);
    const bl = proj(0, ty1, 0), br = proj(TW, ty1, 0);
    const ux = ((tr.x - tl.x) + (br.x - bl.x)) / 2, uy = ((tr.y - tl.y) + (br.y - bl.y)) / 2;
    const topMidX = (tl.x + tr.x) / 2, topMidY = (tl.y + tr.y) / 2;
    const botMidX = (bl.x + br.x) / 2, botMidY = (bl.y + br.y) / 2;
    const ox = topMidX - ux / 2, oy = topMidY - uy / 2;
    const h = ty1 - ty0;
    ctx.save();
    // transform(), not setTransform(): the static layer is supersampled (R25.SS)
    // and a setTransform here threw that scale away, drawing the print at 2/3
    // size in the layer's top-left corner (Ian, 2026-09-12: "what happened to
    // the background art?")
    ctx.transform(ux / TW, uy / TW, (botMidX - topMidX) / h, (botMidY - topMidY) / h, ox, oy);
    ctx.drawImage(pfc, 0, ty0, TW, h + 1.5, 0, 0, TW, h + 1.5);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- walls ----------
const WALLSPEC = {
  guide: { z: 34, side: '#25344c', top: '#5f7492', spec: 'rgba(200,220,245,0.35)' },
  back:  { z: 46, side: '#1a2230', top: '#3e4a5c', spec: 'rgba(200,215,230,0.16)' },
  frame: { z: 40, side: '#1d2940', top: '#4a5d7c', spec: 'rgba(190,210,240,0.22)' },
  // the funnel and lock rims, and the guide wings that feed the locks: lower,
  // brass-topped, so they read as the lip of a bowl rather than a fence
  rim:   { z: 28, side: '#5a4a2c', top: '#caa54c', spec: 'rgba(255,246,214,0.6)' },
};
// WALL PALETTES, for choosing by eye. ?walls=N picks one at boot; [ and ]
// cycle them live and re-bake the static layer. Sides are thin slivers from
// this camera --- the TOP face is most of what you see, so that is the one
// that decides the look.
const WALL_PALETTES = [
  ['indigo',        '#1d2940', '#4a5d7c'],
  ['deep navy',     '#121a2c', '#33445f'],
  ['graphite',      '#1e2126', '#4a4f58'],
  ['walnut',        '#2b1f16', '#6b4a2e'],
  ['black lacquer', '#0f1218', '#7d8797'],
  ['slate + brass', '#25344c', '#caa54c'],
  ['storm grey',    '#33404f', '#8a9bb0'],
  ['crimson',       '#3a1418', '#7a2a30'],
  // cream offset to a warmer, darker parchment (Ian, 2026-09-13: on the Pixel the
  // walls "kinda blend" with the art's cream --- the giant's face and beard sit
  // around rgb 214-240 / 211-232 / 190-205; this is ~15% darker and warmer)
  ['cream',         '#2a2f3a', '#d9c7a2'],
  ['ember edge',    '#1d2940', '#d9822e'],
];
function hexMul(hex, k) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function applyWallPalette(i, rebuild = true) {
  const n = WALL_PALETTES.length; i = ((i % n) + n) % n;
  const [, side, top] = WALL_PALETTES[i];
  WALLSPEC.frame.side = side;             WALLSPEC.frame.top = top;
  WALLSPEC.guide.side = hexMul(side, 1.25); WALLSPEC.guide.top = hexMul(top, 1.15);
  WALLSPEC.back.side  = hexMul(side, 0.8);  WALLSPEC.back.top  = hexMul(top, 0.75);
  R25.pal = i; R25.palShownUntil = performance.now() + 2500;
  if (rebuild && R25.ready) buildStaticLayer();
}
// Web build: gated behind ?dev=1 — see the DEBUGKEYS note in index.html. Read
// independently of that const because the two files' load order is not
// guaranteed and a classic script's top-level const is not on window.
const R25_DEVKEYS = new URLSearchParams(location.search).has('dev');
addEventListener('keydown', e => {
  if (!R25_DEVKEYS) return;
  if (typeof VIEW25 === 'undefined' || !VIEW25 || !R25.ready || e.repeat) return;
  if (e.code === 'BracketRight') applyWallPalette((R25.pal || 0) + 1);
  if (e.code === 'BracketLeft')  applyWallPalette((R25.pal || 0) - 1);
});
function wallClass25(name) {
  if (/Rim|Wing|Peak/.test(name)) return 'rim';
  if (/Guide|Spin[WE]|LaneWest|Inlane|Outlane|Ledge|Shed|Seal|Orbit/.test(name)) return 'guide';
  if (/Back|Block/.test(name)) return 'back';
  return 'frame';
}
function wallSpecular(ctx, w, z, colour) {
  const n = w.pts.length / 2;
  if (n < 2 || n !== Math.floor(n)) return;
  ctx.save();
  ctx.strokeStyle = colour; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = proj(w.pts[i][0], w.pts[i][1], z);
    i ? ctx.lineTo(p.x, p.y - 1) : ctx.moveTo(p.x, p.y - 1);
  }
  ctx.stroke();
  ctx.restore();
}
// The back wall. BoundT is a 7-unit collision band at the far edge, which the
// perspective squashes to a line. Draw it as the cabinet's back rail instead:
// extruded OUTWARD past the table edge (so the ball's boundary does not move)
// and taller than any playfield wall. Follows the wall palette.
const BACK_WALL = { depth: 28, z: 74 };
function backWallFootprint(w) {
  const xs = w.pts.map(p => p[0]), ys = w.pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yIn = Math.max(...ys), d = BACK_WALL.depth;
  return [[x0 - d, yIn - d], [x1 + d, yIn - d], [x1 + d, yIn], [x0 - d, yIn]];
}
// the side rails: the two side bounds extruded OUTWARD by the same depth, from
// the back rail's outer edge down to the table's foot
function sideRailFootprint(w) {
  const xs = w.pts.map(p => p[0]), ys = w.pts.map(p => p[1]), d = BACK_WALL.depth;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const left = (x0 + x1) / 2 < TW / 2;
  return left ? [[x0 - d, -d], [x1, -d], [x1, y1], [x0 - d, y1]] : [[x0, -d], [x1 + d, -d], [x1 + d, y1], [x0, y1]];
}
function drawWalls25(ctx) {
  const back = GEO.walls.find(w => w.name === 'BoundT');
  const sides = GEO.walls.filter(w => w.name === 'BoundL' || w.name === 'BoundR');
  const rest = GEO.walls.filter(w => w !== back && !sides.includes(w));
  const s = WALLSPEC.frame;
  for (const w of sides) { const fp = sideRailFootprint(w); prismShadowP(ctx, fp, BACK_WALL.z, 0.35); prism(ctx, fp, 0, BACK_WALL.z, s.side, s.top); }
  if (back) {
    const fp = backWallFootprint(back);
    prismShadowP(ctx, fp, BACK_WALL.z, 0.35);
    prism(ctx, fp, 0, BACK_WALL.z, s.side, s.top);
  }

  for (const w of rest) prismShadowP(ctx, w.pts, WALLSPEC[wallClass25(w.name)].z, 0.3);
  for (const w of rest) { const s = WALLSPEC[wallClass25(w.name)]; prism(ctx, w.pts, 0, s.z, s.side, s.top); }
  for (const w of rest) { const s = WALLSPEC[wallClass25(w.name)]; wallSpecular(ctx, w, s.z, s.spec); }
}

// ---------- slings, drops, flippers ----------
function slingAxis(pts) {
  let a = pts[0], b = pts[0];
  for (const p of pts) { if (p[1] < a[1]) a = p; if (p[1] > b[1]) b = p; }
  return { ax: a[0], ay: a[1], bx: b[0], by: b[1] };
}
function lozenge(ax, ay, bx, by, widths) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const n = widths.length, Lp = [], Rp = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = ax + dx * t, y = ay + dy * t, w = widths[i];
    Lp.push([x + px * w, y + py * w]); Rp.push([x - px * w, y - py * w]);
  }
  return Lp.concat(Rp.reverse());
}
function drawSling25(ctx, s, hot) {
  const { ax, ay, bx, by } = slingAxis(s.pts);
  const plate = lozenge(ax, ay, bx, by, [10, 22, 30, 22, 10]);
  prismShadowP(ctx, plate, 38, 0.42);
  prism(ctx, plate, 0, 8, '#151b28', '#2a3446');                     // bracket plate
  const body = lozenge(ax, ay, bx, by, [5, 17, 25, 17, 5]);
  prism(ctx, body, 8, 38, hot ? '#e0803a' : '#26334a', hot ? '#ffd090' : '#5c7090');
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const inx = -uy, iny = ux;
  const toward = (TW / 2 - (ax + bx) / 2) * inx + (TH / 2 - (ay + by) / 2) * iny > 0 ? 1 : -1;
  const rax = ax + inx * toward * 9, ray = ay + iny * toward * 9, rbx = bx + inx * toward * 9, rby = by + iny * toward * 9;
  prism(ctx, lozenge(rax, ray, rbx, rby, [4, 11, 15, 11, 4]), 30, 46, '#1c110d', '#3c2a20');   // rubber
  for (const [px2, py2] of [[ax, ay], [bx, by]]) {
    const post = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; post.push([px2 + 7 * Math.cos(a), py2 + 7 * Math.sin(a)]); }
    prism(ctx, post, 8, 50, '#7a6a3a', '#d9c27a');                    // brass post
    const c = proj(px2, py2, 50);
    ctx.fillStyle = '#caa54c'; ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,10,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,214,0.7)'; ctx.beginPath(); ctx.arc(c.x - 1, c.y - 1, 1.6, 0, 7); ctx.fill();
  }
}
const INK = { cream: '#e8dfc8', ember: '#d9822e' };
function dropFootprint(d) {
  const a = d.rot * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  return [
    [d.x - 18 * dx + 3 * px, d.y - 18 * dy + 3 * py], [d.x + 18 * dx + 3 * px, d.y + 18 * dy + 3 * py],
    [d.x + 18 * dx - 3 * px, d.y + 18 * dy - 3 * py], [d.x - 18 * dx - 3 * px, d.y - 18 * dy - 3 * py],
  ];
}
// THE BANK (Ian, 2026-09-11: cream targets on the cream beard were invisible;
// "make that target bank stand out more... just do all 5"): navy bodies with
// the lightning's orange on the player-facing side (1), a black housing rising
// behind the row (2), taller and thicker targets (3), a bolt printed on each
// face (4), and an arrow insert on the print in front of each target that
// pulses while it is up and goes dark once it has dropped (5).
// The housing is RENDER ONLY --- no wall was added, so the lane the swept bank
// opens up the middle is unchanged. A ball rolling past it is occluded by it
// (bankOcclude) rather than blocked.
const BANK = { z: 42, depth: 10, housingZ: 52, housingDepth: 14, wing: 14,
  face: '#f86000', body: '#141c2e', bodyTop: '#2a3448', print: '#fff2cf',
  housing: '#0b0f1a', housingTop: '#1f2839' };
function dropFootprint(d) {   // physics width (+-18 along the segment), BANK.depth thick
  const a = d.rot * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx, h = BANK.depth / 2;
  return [
    [d.x - 18 * dx + h * px, d.y - 18 * dy + h * py], [d.x + 18 * dx + h * px, d.y + 18 * dy + h * py],
    [d.x + 18 * dx - h * px, d.y + 18 * dy - h * py], [d.x - 18 * dx - h * px, d.y - 18 * dy - h * py],
  ];
}
// the banks as groups: extent along the row, and which way is "behind" (away
// from the player, i.e. up-table: the side the ball does NOT hit from)
function bankGroups() {
  const groups = new Map();
  GEO.drops.forEach((d, i) => { const k = d.bank ?? i; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ d, i }); });
  return [...groups.values()].map(list => {
    const xs = list.map(o => o.d.x), y = list.reduce((s, o) => s + o.d.y, 0) / list.length;
    const x0 = Math.min(...xs) - 18 - BANK.wing, x1 = Math.max(...xs) + 18 + BANK.wing;
    const yFront = y - BANK.depth / 2 - 1, yBack = yFront - BANK.housingDepth;
    return { list, x0, x1, y, fp: [[x0, yBack], [x1, yBack], [x1, yFront], [x0, yFront]] };
  });
}
function drawBankStatic(ctx) {
  for (const g of bankGroups()) {
    prismShadowP(ctx, g.fp, BANK.housingZ, 0.35);
    prism(ctx, g.fp, 0, BANK.housingZ, BANK.housing, BANK.housingTop);
    // the slots the targets drop into, cut in the print in front of the housing
    for (const { d } of g.list) {
      ctx.fillStyle = '#05070c'; pathPoly(ctx, dropFootprint(d).map(p => proj(p[0], p[1], 0.6))); ctx.fill();
      ctx.strokeStyle = 'rgba(180,190,210,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
}
function drawDrop25(ctx, d) {
  const fp = dropFootprint(d), z = BANK.z;
  prismShadowP(ctx, fp, z, 0.3);
  prism(ctx, fp, 0, z, BANK.body, BANK.bodyTop);
  // the face the player sees: the +y side (fp[2]->fp[3]), painted orange
  const a = fp[2], b = fp[3];
  const P = [proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(b[0], b[1], z), proj(a[0], a[1], z)];
  // the +y face is the unlit side under our light (L.y > 0); a printed face
  // should read as its own colour, so floor the shading rather than let it go brown
  ctx.fillStyle = shade(BANK.face, Math.max(0.92, faceLight(0, 1))); pathPoly(ctx, P); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,180,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  // the bolt, printed on the face: a zigzag in the face's own plane
  const fx = (s, h) => proj((a[0] + b[0]) / 2 + (b[0] - a[0]) / 36 * s, (a[1] + b[1]) / 2 + (b[1] - a[1]) / 36 * s, h);
  const bolt = [[-3, 37], [4, 23], [-2, 23], [5, 6]].map(q => fx(q[0], q[1]));
  ctx.save(); ctx.strokeStyle = BANK.print; ctx.lineWidth = 3.2; ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bolt[0].x, bolt[0].y); for (const q of bolt.slice(1)) ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore();
}
function drawDropDown25(ctx, d) { /* the static slot IS the down state */ }
// arrow inserts on the print in front of each target
function drawBankInserts(ctx) {
  const t = performance.now();
  GEO.drops.forEach((d, i) => {
    const up = !!S.drops[i];
    const y0 = d.y + BANK.depth / 2 + 10, y1 = y0 + 24;
    const P = [proj(d.x, y0, 0.5), proj(d.x + 12, y1, 0.5), proj(d.x - 12, y1, 0.5)];
    if (up) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 170 + i * 0.9);
      ctx.fillStyle = `rgba(255,176,84,${(0.30 + 0.50 * pulse).toFixed(3)})`; ctx.strokeStyle = '#ffd479';
    } else { ctx.fillStyle = 'rgba(16,20,32,0.85)'; ctx.strokeStyle = 'rgba(120,130,150,0.5)'; }
    ctx.lineWidth = 2; pathPoly(ctx, P); ctx.fill(); ctx.stroke();
  });
}
// a ball beyond the bank (up-table of it) is behind the housing and the
// standing targets from this camera: redraw them over it
function bankOcclude(ctx) {
  for (const g of bankGroups()) {
    const behind = S.balls.some(b => b.y < g.y && b.x > g.x0 - 30 && b.x < g.x1 + 30 && (b.z || 0) < 60);
    if (!behind) continue;
    prism(ctx, g.fp, 0, BANK.housingZ, BANK.housing, BANK.housingTop);
    for (const { d, i } of g.list) if (S.drops[i]) drawDrop25(ctx, d);
  }
}
function flipperFootprintLive(f, angFrac) {
  const a = (f.start + (f.endA - f.start) * angFrac) * Math.PI / 180;
  const dirx = Math.sin(a), diry = -Math.cos(a);
  const tipx = f.x + f.len * dirx, tipy = f.y + f.len * diry;
  const px = -diry, py = dirx;
  return [[f.x + px * f.base, f.y + py * f.base], [tipx + px * f.end, tipy + py * f.end],
    [tipx - px * f.end, tipy - py * f.end], [f.x - px * f.base, f.y - py * f.base]];
}
function drawFlipper25(ctx, f, angFrac) {
  const fp = flipperFootprintLive(f, angFrac);
  prismShadowP(ctx, fp, 26, 0.32);
  prism(ctx, fp, 0, 26, '#8a6a26', '#f0dc94');
  const a = (f.start + (f.endA - f.start) * angFrac) * Math.PI / 180;
  const dirx = Math.sin(a), diry = -Math.cos(a);
  const tipx = f.x + f.len * dirx, tipy = f.y + f.len * diry;
  const px = -diry, py = dirx, side = f.side === 'L' ? 1 : -1;
  const e1 = proj(f.x + px * f.base * side, f.y + py * f.base * side, 26);
  const e2 = proj(tipx + px * f.end * side, tipy + py * f.end * side, 26);
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#c2701f'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,214,150,0.55)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(e1.x, e1.y - 1.5); ctx.lineTo(e2.x, e2.y - 1.5); ctx.stroke();
  const pv = proj(f.x, f.y, 27), tp = proj(tipx, tipy, 27);
  for (const [pt, r] of [[pv, f.base * 0.52], [tp, f.end * 0.5]]) {
    ctx.fillStyle = '#caa54c'; ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,10,0.65)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,214,0.8)';
    ctx.beginPath(); ctx.arc(pt.x - r * 0.28, pt.y - r * 0.3, r * 0.3, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---------- the ball ----------
function drawBall25(ctx, bx, by, bz, br) {
  const r0 = proj(bx, by, bz), rEdge = proj(bx + br, by, bz);
  const Rr = Math.hypot(rEdge.x - r0.x, rEdge.y - r0.y);
  const o = shOff(bz);
  if (FX.low) {   // gradient shadow disc instead of a blurred fill
    const s0 = proj(bx + o.dx * 0.9, by + o.dy * 0.9, 0), sr = Rr * 1.15;
    const sg = ctx.createRadialGradient(s0.x, s0.y, sr * 0.3, s0.x, s0.y, sr); sg.addColorStop(0, 'rgba(4,3,8,0.5)'); sg.addColorStop(1, 'rgba(4,3,8,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(s0.x, s0.y, sr, 0, 7); ctx.fill();
  } else {
    ctx.save(); ctx.filter = 'blur(6px)'; ctx.fillStyle = 'rgba(4,3,8,0.5)';
    circle3(ctx, bx + o.dx * 0.9, by + o.dy * 0.9, 0, br * 0.96); ctx.fill(); ctx.restore();
  }
  const g = ctx.createRadialGradient(r0.x - Rr * 0.42, r0.y - Rr * 0.48, Rr * 0.08, r0.x, r0.y, Rr);
  g.addColorStop(0, '#f6f8fa'); g.addColorStop(0.42, '#b9c0ca'); g.addColorStop(0.8, '#6a7280'); g.addColorStop(1, '#3c414c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r0.x, r0.y, Rr, 0, 7); ctx.fill();
  if (pfc) {
    // the print reflected in the steel, upside down and soft
    ctx.save(); ctx.beginPath(); ctx.arc(r0.x, r0.y, Rr * 0.985, 0, 7); ctx.clip();
    ctx.globalAlpha = 0.32; if (!FX.low) ctx.filter = 'blur(2px)';
    const sx = clamp(bx - 66, 0, TW - 132), sy = clamp(by - 26, 0, TH - 92);
    ctx.translate(r0.x, r0.y); ctx.scale(1, -1);
    ctx.drawImage(pfc, sx, sy, 132, 92, -Rr, -Rr, 2 * Rr, Rr * 0.95);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(r0.x - Rr * 0.4, r0.y - Rr * 0.46, Rr * 0.12, 0, 7); ctx.fill();
}

// ---------- HERO bumper: baked once per bumper, lamp live ----------
// The HERO numbers were tuned for the r45 pop; Table S runs r30 bumpers under
// the canopy, so every dimension is scaled by r/45 at bake time.
const HERO45 = { skR: 66, skZ0: 3, skZ1: 14, skInR: 30, bodyR: 33, bodyZ0: 5, bodyZ1: 46,
  ringR: 52.5, ringTube: 5.5, ringZ: 16, capR: 58, capTopR: 52, capZ0: 46, capZ1: 56 };
const COL = { skirt: '#22305c', body: '#e8dfc8', capBevel: '#141d3a' };
const SKIRT_ON = false, SKIRT_WAVES = 10;
function heroFor(r) { const s = r / 45, H = {}; for (const k in HERO45) H[k] = HERO45[k] * s; return H; }
function makeSprite(wx, wy, pad, zTop, extra = 30) {
  const ps = [];
  for (const dx of [-pad, pad]) for (const dy of [-pad, pad]) for (const z of [0, zTop]) ps.push(proj(wx + dx, wy + dy, z));
  const x0 = Math.floor(Math.min(...ps.map(p => p.x)) - extra), y0 = Math.floor(Math.min(...ps.map(p => p.y)) - extra);
  const x1 = Math.ceil(Math.max(...ps.map(p => p.x)) + extra), y1 = Math.ceil(Math.max(...ps.map(p => p.y)) + extra);
  const c = document.createElement('canvas'); c.width = Math.max(1, x1 - x0); c.height = Math.max(1, y1 - y0);
  const g = c.getContext('2d'); g.translate(-x0, -y0);
  return { c, g, ox: x0, oy: y0 };
}
function bumperFootPath(B, H, scale, ox, oy) {
  const pts = [];
  const R0 = SKIRT_ON ? H.skR : H.bodyR;
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    const w = SKIRT_ON ? (1 + 0.055 * Math.sin(a * SKIRT_WAVES)) : 1;
    const r = R0 * w * scale;
    pts.push(proj(B.x + r * Math.cos(a) + ox, B.y + r * Math.sin(a) + oy, 0));
  }
  return pts;
}
function prismShadowBumper(ctx, B, H) {
  const o1 = shOff(H.skZ0), o2 = shOff(H.bodyZ1 * 0.55), o3 = shOff(H.capZ1);
  ctx.save();
  ctx.filter = 'blur(2.5px)'; ctx.fillStyle = 'rgba(3,2,7,0.52)';
  pathPoly(ctx, bumperFootPath(B, H, 1.02, o1.dx * 0.35, o1.dy * 0.35)); ctx.fill();
  ctx.filter = 'blur(7px)'; ctx.fillStyle = 'rgba(3,2,7,0.26)';
  pathPoly(ctx, bumperFootPath(B, H, 0.94, o2.dx, o2.dy)); ctx.fill();
  ctx.filter = 'blur(13px)'; ctx.fillStyle = 'rgba(3,2,7,0.13)';
  circle3(ctx, B.x + o3.dx, B.y + o3.dy, 0, H.capR * 0.92); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(6,4,10,0.62)'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  pathPoly(ctx, bumperFootPath(B, H, 1.0, 0, 0)); ctx.stroke();
  ctx.restore();
}
function bakeBumper(B, capQ) {
  const H = heroFor(B.r), BSP = { H };
  const base = BSP.base = makeSprite(B.x, B.y, H.skR + 14, H.bodyZ1, 26);
  const g = base.g;
  const BN = 28;
  for (let i = 0; i < BN; i++) {
    const a0 = i / BN * Math.PI * 2, a1 = (i + 1) / BN * Math.PI * 2;
    const nx = Math.cos((a0 + a1) / 2), ny = Math.sin((a0 + a1) / 2);
    if (nx * (CAM.x - B.x) + ny * (CAM.y - B.y) <= 0) continue;
    const p = [proj(B.x + H.bodyR * Math.cos(a0), B.y + H.bodyR * Math.sin(a0), H.bodyZ0), proj(B.x + H.bodyR * Math.cos(a1), B.y + H.bodyR * Math.sin(a1), H.bodyZ0),
      proj(B.x + H.bodyR * Math.cos(a1), B.y + H.bodyR * Math.sin(a1), H.bodyZ1), proj(B.x + H.bodyR * Math.cos(a0), B.y + H.bodyR * Math.sin(a0), H.bodyZ1)];
    const dH = Math.max(0, -(nx * L.x + ny * L.y));
    g.fillStyle = shade(COL.body, 0.62 + 0.42 * dH); pathPoly(g, p); g.fill();
  }
  const ring = BSP.ring = makeSprite(B.x, B.y, H.ringR + H.ringTube + 6, H.capZ0, 14);
  const rg = ring.g;
  {
    const c0 = proj(B.x, B.y, H.ringZ), cE = proj(B.x + H.ringR, B.y, H.ringZ);
    const Rr = Math.hypot(cE.x - c0.x, cE.y - c0.y);
    const cg = rg.createLinearGradient(c0.x - Rr, c0.y - Rr, c0.x + Rr * 0.5, c0.y + Rr * 0.9);
    cg.addColorStop(0, '#f6fafd'); cg.addColorStop(0.3, '#c6ced8'); cg.addColorStop(0.6, '#69707c'); cg.addColorStop(1, '#454c56');
    rg.fillStyle = cg;
    rg.beginPath(); circlePts(B.x, B.y, H.ringZ, H.ringR + H.ringTube, 40).forEach((p, i) => i ? rg.lineTo(p.x, p.y) : rg.moveTo(p.x, p.y)); rg.closePath();
    circlePts(B.x, B.y, H.ringZ, H.ringR - H.ringTube, 40).forEach((p, i) => i ? rg.lineTo(p.x, p.y) : rg.moveTo(p.x, p.y)); rg.closePath();
    rg.fill('evenodd');
  }
  const cap = BSP.cap = makeSprite(B.x, B.y, H.capR + 6, H.capZ1, 14);
  const cg2 = cap.g;
  const CN = 48, upC = Math.sin(Math.atan2(H.capZ1 - H.capZ0, H.capR - H.capTopR)) * 0.55 + 0.2;
  for (let i = 0; i < CN; i++) {
    const a0 = i / CN * Math.PI * 2, a1 = (i + 1) / CN * Math.PI * 2, am = (a0 + a1) / 2;
    const hx = Math.cos(am), hy = Math.sin(am);
    const n = vnorm({ x: hx * 0.72, y: hy * 0.72, z: upC });
    const d = Math.max(0, -vdot(n, L));
    const k = clamp(0.42 + 0.85 * d, 0, 1.5);
    const p = [proj(B.x + H.capR * Math.cos(a0), B.y + H.capR * Math.sin(a0), H.capZ0), proj(B.x + H.capR * Math.cos(a1), B.y + H.capR * Math.sin(a1), H.capZ0),
      proj(B.x + H.capTopR * Math.cos(a1), B.y + H.capTopR * Math.sin(a1), H.capZ1), proj(B.x + H.capTopR * Math.cos(a0), B.y + H.capTopR * Math.sin(a0), H.capZ1)];
    cg2.fillStyle = shade(COL.capBevel, k); pathPoly(cg2, p); cg2.fill();
  }
  if (capQ) {
    const S2 = 300;
    const flat = document.createElement('canvas'); flat.width = S2; flat.height = S2;
    const fg = flat.getContext('2d');
    fg.beginPath(); fg.arc(S2 / 2, S2 / 2, S2 / 2, 0, 7); fg.clip();
    fg.fillStyle = '#141b2c'; fg.fillRect(0, 0, S2, S2);
    fg.drawImage(capQ, 0, 0, S2, S2);
    const c0 = proj(B.x, B.y, H.capZ1), ex = proj(B.x + H.capTopR, B.y, H.capZ1), ey = proj(B.x, B.y + H.capTopR, H.capZ1);
    cg2.save();
    circle3(cg2, B.x, B.y, H.capZ1, H.capTopR, 40); cg2.clip();
    cg2.setTransform(1, 0, 0, 1, 0, 0); cg2.translate(-cap.ox, -cap.oy);
    cg2.transform((ex.x - c0.x) / (S2 / 2), (ex.y - c0.y) / (S2 / 2), (ey.x - c0.x) / (S2 / 2), (ey.y - c0.y) / (S2 / 2), c0.x, c0.y);
    cg2.drawImage(flat, -S2 / 2, -S2 / 2);
    cg2.setTransform(1, 0, 0, 1, 0, 0); cg2.translate(-cap.ox, -cap.oy);
    cg2.restore();
  }
  const lit = BSP.lit = makeSprite(B.x, B.y, 140 * (B.r / 45), H.capZ1, 30);
  const lg = lit.g;
  const c0 = proj(B.x, B.y, 0), rAt = r => { const e = proj(B.x + r, B.y, 0); return Math.hypot(e.x - c0.x, e.y - c0.y); };
  const glowR = 130 * (B.r / 45);
  const pg = lg.createRadialGradient(c0.x, c0.y, rAt(H.skR) * 0.9, c0.x, c0.y, rAt(glowR));
  pg.addColorStop(0, 'rgba(255,178,92,0.14)'); pg.addColorStop(0.5, 'rgba(255,150,70,0.05)'); pg.addColorStop(1, 'rgba(255,150,70,0)');
  lg.fillStyle = pg; circle3(lg, B.x, B.y, 0, glowR, 32); lg.fill();
  lg.save(); lg.globalCompositeOperation = 'destination-out'; lg.globalAlpha = 0.85;
  circle3(lg, B.x, B.y, (H.capZ0 + H.capZ1) / 2, H.capR + 1, 32); lg.fill(); lg.restore();
  const blur = BSP.litBlur = { c: document.createElement('canvas'), ox: lit.ox, oy: lit.oy };
  blur.c.width = lit.c.width; blur.c.height = lit.c.height;
  const bb = blur.c.getContext('2d');
  bb.filter = 'blur(10px)'; bb.drawImage(lit.c, 0, 0);
  return BSP;
}
function drawBumper25(ctx, B, BSP, hot) {
  prismShadowBumper(ctx, B, BSP.H);
  ctx.drawImage(BSP.base.c, BSP.base.ox, BSP.base.oy);
  ctx.drawImage(BSP.ring.c, BSP.ring.ox, BSP.ring.oy);
  ctx.drawImage(BSP.cap.c, BSP.cap.ox, BSP.cap.oy);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55 + 0.35 * clamp(hot / 6, 0, 1);
  ctx.drawImage(BSP.lit.c, BSP.lit.ox, BSP.lit.oy);
  if (hot > 0) { ctx.globalAlpha = clamp(hot / 6, 0, 1) * 0.8; ctx.drawImage(BSP.litBlur.c, BSP.litBlur.ox, BSP.litBlur.oy); }
  ctx.restore();
}

// ============ NEW for Table S: the hardware the old build never had ============

// A FUNNEL. The rim wall is a normal wall (VortexRim / *LockRim) and draws as
// one; this is the bowl inside it: a cone from the rim height down to the
// floor, shaded by which way each patch faces the light, with the chute
// rings drawn ON the cone at their own radius and height. Baked static.
function bowlZ(bw, rr) { return bw.zFloor + (bw.zRim - bw.zFloor) * (rr / bw.r); }
function drawBowlStatic(ctx, bw) {
  const NA = 28, NR = 7;
  const baseHex = bw.lock ? '#1d2436' : '#131a2a';
  for (let j = 0; j < NR; j++) {
    const r0 = bw.r * (1 - j / NR), r1 = bw.r * (1 - (j + 1) / NR);
    for (let i = 0; i < NA; i++) {
      const a0 = i / NA * Math.PI * 2, a1 = (i + 1) / NA * Math.PI * 2, am = (a0 + a1) / 2;
      // inward normal of the cone wall at this angle; the far side faces the light
      const lit = Math.max(0, Math.cos(am) * L.x + Math.sin(am) * L.y);
      const depth = 1 - (j + 0.5) / NR;          // 1 at the rim, 0 at the centre
      const k = 0.35 + 0.55 * lit * depth + 0.25 * (1 - depth);
      const p = [proj(bw.x + r0 * Math.cos(a0), bw.y + r0 * Math.sin(a0), bowlZ(bw, r0)),
        proj(bw.x + r0 * Math.cos(a1), bw.y + r0 * Math.sin(a1), bowlZ(bw, r0)),
        proj(bw.x + r1 * Math.cos(a1), bw.y + r1 * Math.sin(a1), bowlZ(bw, r1)),
        proj(bw.x + r1 * Math.cos(a0), bw.y + r1 * Math.sin(a0), bowlZ(bw, r1))];
      ctx.fillStyle = shade(baseHex, k); pathPoly(ctx, p); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.7; ctx.stroke();
    }
  }
  // the lip: a brass ring at the rim height
  ctx.save(); ctx.strokeStyle = shade('#caa54c', TOP_LIGHT + 0.2); ctx.lineWidth = 3;
  circle3(ctx, bw.x, bw.y, bw.zRim, bw.r, 48); ctx.stroke(); ctx.restore();
  // chute rings, on the cone surface, with their value printed above
  ctx.save(); ctx.font = 'bold 15px ui-monospace,monospace'; ctx.textAlign = 'center';
  for (const c of bw.chutes) {
    const z = bowlZ(bw, c.r);
    ctx.setLineDash([7, 6]); ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2.5;
    circle3(ctx, bw.x, bw.y, z + 0.5, c.r, 40); ctx.stroke(); ctx.setLineDash([]);
    const t = proj(bw.x, bw.y - c.r, z + 2);
    ctx.fillStyle = '#ffd479'; ctx.fillText((c.value || 0).toLocaleString(), t.x, t.y - 4);
  }
  // the floor: a dark disc, ringed
  ctx.fillStyle = bw.lock ? '#0b0f18' : '#0a0e16';
  circle3(ctx, bw.x, bw.y, bw.zFloor + 0.3, bw.r * 0.14, 24); ctx.fill();
  ctx.strokeStyle = bw.lock ? '#7fe8a0' : '#ffd479'; ctx.lineWidth = 2; ctx.stroke();
  const t2 = proj(bw.x, bw.y + bw.r + 14, 0);
  ctx.fillStyle = 'rgba(207,228,255,0.85)'; ctx.font = 'bold 14px ui-monospace,monospace';
  ctx.fillText(bw.name, t2.x, t2.y);
  ctx.restore();
}

// THE CANOPY: a raised, translucent slab you look down through. Shadow on the
// print, side faces, a see-through top so the bumpers underneath stay
// visible, then the pegs standing on it and the jackpot hole cut into it.
function drawDeckStatic(ctx, d) {
  const fp = d.pts, z = d.z;
  prismShadowP(ctx, fp, z, 0.32);
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const nd = Math.hypot(nx, ny) || 1; nx /= nd; ny /= nd;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (nx * (CAM.x - mx) + ny * (CAM.y - my) <= 0) continue;
    const p = [proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(b[0], b[1], z), proj(a[0], a[1], z)];
    ctx.fillStyle = `rgba(150,175,215,${(CANOPY_A.side + CANOPY_A.sideLit * faceLight(nx, ny)).toFixed(3)})`;
    pathPoly(ctx, p); ctx.fill();
  }
  ctx.fillStyle = `rgba(170,195,235,${CANOPY_A.top})`;
  pathPoly(ctx, fp.map(p => proj(p[0], p[1], z))); ctx.fill();
  ctx.strokeStyle = 'rgba(226,238,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
  // the perimeter rail on top of it
  // where a ramp lands on this deck, its rail has a gap (render only: the ball
  // is released inside the deck, it never crosses this wall)
  const gaps = RAMPS.filter(r => pointInPoly(r.pts[r.pts.length - 1].x, r.pts[r.pts.length - 1].y, d.pts)).map(r => r.pts[r.pts.length - 1]);
  for (const s of d.segs) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, dd = Math.hypot(dx, dy) || 1, ux = dx / dd, uy = dy / dd, px = -uy * 3, py = ux * 3;
    let pieces = [[0, dd]];
    for (const gp of gaps) {
      const t = (gp.x - s.x1) * ux + (gp.y - s.y1) * uy, off = Math.abs((gp.x - s.x1) * -uy + (gp.y - s.y1) * ux);
      if (t > 0 && t < dd && off < 40) pieces = pieces.flatMap(([a, b]) => (t - 34 > a ? [[a, Math.min(b, t - 34)]] : []).concat(t + 34 < b ? [[Math.max(a, t + 34), b]] : []));
    }
    for (const [a, b] of pieces) {
      const x1 = s.x1 + ux * a, y1 = s.y1 + uy * a, x2 = s.x1 + ux * b, y2 = s.y1 + uy * b;
      prism(ctx, [[x1 + px, y1 + py], [x2 + px, y2 + py], [x2 - px, y2 - py], [x1 - px, y1 - py]], z, z + 12, '#46586a', '#e8dfc8');
    }
  }
  // pegs: little brass posts
  for (const p of d.pins) {
    const fpp = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; fpp.push([p.x + p.r * Math.cos(a), p.y + p.r * Math.sin(a)]); }
    prism(ctx, fpp, z, z + 14, '#7a6a3a', '#e6d59a');
  }
  // the hole
  for (const h of d.holes) {
    ctx.fillStyle = 'rgba(8,10,18,0.95)'; circle3(ctx, h.x, h.y, z + 0.4, h.r, 32); ctx.fill();
    ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 3; ctx.stroke();
  }
  const c = proj(fp[0][0] + 80, fp[0][1] + 18, z + 1);
  ctx.fillStyle = 'rgba(159,216,255,0.9)'; ctx.font = 'bold 15px ui-monospace,monospace'; ctx.textAlign = 'center';
  ctx.fillText(d.name, c.x, c.y); ctx.textAlign = 'left';
}

// ============ LAMPS AND INSERTS (Ian, 2026-09-12: "go with your recommendations") ============
// Insert bodies (bezel + dark lens) are baked into the print; the lit states
// are drawn live with a soft additive glow. Colour rule: AMBER = shoot this,
// GREEN = done, WHITE = jackpot, the lightning's ORANGE = finale only (eyes,
// mouth), so the storm colour stays special. Positions are on cloud/beard art,
// outside the face circle, and clear of the ramp decks (checked against the
// serpentine's path: the west lock arrow sits at y300 because the ramp crosses
// (300,252)). No hardware --- lamps only.
const LAMP = { amber: '#ffb054', green: '#7fe8a0', white: '#eaf6ff', dark: 'rgba(0,0,0,0)' };
const INSERTS = [
  { id: 'lockW',  kind: 'arrow', x: 280, y: 300,  to: [280, 125], r: 22 },
  { id: 'lockE',  kind: 'arrow', x: 495, y: 250,  to: [495, 125], r: 22 },
  { id: 'canopy', kind: 'arrow', x: 687, y: 938,  to: [720, 865], r: 22 },
  { id: 'mbLit',  kind: 'round', x: 700, y: 790,  r: 15 },
  { id: 'super',  kind: 'round', x: 436, y: 1660, r: 15 },
  { id: 'storm1', kind: 'chev',  x: 72,  y: 1100, r: 15 },
  { id: 'storm2', kind: 'chev',  x: 72,  y: 1045, r: 15 },
  { id: 'storm3', kind: 'chev',  x: 72,  y: 990,  r: 15 },
];
function insertPath(ctx, ins, z) {
  const { x, y, r } = ins;
  if (ins.kind === 'round') { circle3(ctx, x, y, z, r, 28); return; }
  if (ins.kind === 'chev') {   // an upward chevron
    pathPoly(ctx, [[x, y - r], [x + r, y], [x + r * 0.55, y], [x, y - r * 0.45], [x - r * 0.55, y], [x - r, y]].map(p => proj(p[0], p[1], z))); return;
  }
  // arrow: a triangle pointing at the shot
  const a = Math.atan2(ins.to[1] - y, ins.to[0] - x), c = Math.cos(a), sn = Math.sin(a);
  const pts = [[r * 1.2, 0], [-r * 0.7, r * 0.8], [-r * 0.35, 0], [-r * 0.7, -r * 0.8]]
    .map(q => [x + q[0] * c - q[1] * sn, y + q[0] * sn + q[1] * c]);
  pathPoly(ctx, pts.map(p => proj(p[0], p[1], z)));
}
function drawInsertsStatic(ctx) {
  ctx.save();
  for (const ins of INSERTS) {
    insertPath(ctx, ins, 0.8); ctx.fillStyle = '#0c1018'; ctx.fill();
    ctx.strokeStyle = '#3a4658'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(226,238,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}
// what each insert says right now: { c: colour, a: 0..1 }; a = 0 means dark
function insertState(id, t) {
  const pulse = 0.55 + 0.45 * Math.sin(t / 180 + id.length);
  const lock = (name) => {
    const bw = BOWLS.find(b => b.lock && b.name === name);
    if (!bw) return { a: 0 };
    if (R.multiball) return R.mbJack[bw.name] ? { c: LAMP.white, a: 0.35 } : { c: LAMP.white, a: pulse };
    return bw.occupied ? { c: LAMP.green, a: 0.9 } : { c: LAMP.amber, a: pulse };
  };
  switch (id) {
    case 'lockW': return lock('WEST LOCK');
    case 'lockE': return lock('EAST LOCK');
    case 'canopy': {
      const r = RAMPS.find(r => r.gatedBy != null); if (!r || !S.rampOpen[r.name]) return { a: 0 };
      return (R.mbLit || R.superLit) ? { c: LAMP.white, a: pulse } : { c: LAMP.green, a: 0.85 };
    }
    case 'mbLit': return R.mbLit ? { c: LAMP.white, a: 0.95 } : { a: 0 };
    case 'super': return R.superLit ? { c: LAMP.white, a: pulse } : { a: 0 };
    default: {   // storm1..3
      const n = +id.slice(-1);
      if (R.level >= n) return { c: LAMP.amber, a: 0.9 };
      if (R.mbLit && n === R.level + 1) return { c: LAMP.amber, a: pulse };
      return { a: 0 };
    }
  }
}
function drawInsertsLive(ctx) {
  const t = performance.now();
  for (const ins of INSERTS) {
    const st = insertState(ins.id, t);
    if (!st.a) continue;
    ctx.save();
    ctx.globalAlpha = st.a; ctx.fillStyle = st.c; insertPath(ctx, ins, 1); ctx.fill();
    if (!FX.low) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = st.a * 0.55; ctx.filter = 'blur(7px)'; insertPath(ctx, ins, 1.2); ctx.fill(); }
    ctx.restore();
  }
  // THE PULL METER: while the plunger is held, the chute ring the current pull
  // would land in lights on the funnel itself (bands per the critic, 2026-09-12)
  if (S.plunging) {
    const bw = BOWLS.find(b => !b.lock); if (!bw) return;
    const p = S.plungePull, rr = p >= 0.8625 ? 100 : p >= 0.725 ? 52 : p >= 0.5375 ? bw.r * 0.14 : 0;
    if (rr) {
      ctx.save(); ctx.strokeStyle = '#fff1a8'; ctx.lineWidth = 5;
      circle3(ctx, bw.x, bw.y, bowlZ(bw, rr) + 1.5, rr, 48); ctx.stroke();
      if (!FX.low) { ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(6px)'; ctx.lineWidth = 9; ctx.globalAlpha = 0.6; ctx.stroke(); }
      ctx.restore();
    }
  }
}

// ============ THE APRON PRINT (lifted from the art build, 2026-08) ============
// Two cards on the apron wedges, two bands across the bottom, four swashes
// routed to stay out of everything. Geometry was MEASURED off the apron V,
// which is shared base geometry (y>=1100 is locked) so it holds on Table S.
// Drawn at the enclosure wall's top height so it registers on its top face.
const APRON_FONT = '"Tw Cen MT Condensed","Bahnschrift Condensed","Roboto Condensed","Arial Narrow",sans-serif';
const APRON_PLATE = 'card3-hairline';
const PLATE_INSET = { 'card3-hairline': { l: 0.070, r: 0.930, t: 0.155, b: 0.880, ink: '#f4f8fc', accent: '#ffc257' } };
const CARDPLATE = {};
(() => { const im = new Image(); im.src = APRON_PLATE + '.png';
  im.onload = () => { CARDPLATE[APRON_PLATE] = im; if (R25.ready) buildStaticLayer(); }; })();
const APRON_Z = () => WALLSPEC.frame.z;
const plateInk = () => PLATE_INSET[APRON_PLATE].ink;
const plateAccent = () => PLATE_INSET[APRON_PLATE].accent;
let HIGH = 0;
try { HIGH = +(localStorage.getItem('th_high') || 0) || 0; } catch (e) {}
function drawImageQuad(ctx, img, x0, y0, x1, y1) {
  const z = APRON_Z();
  const a = proj(x0, y0, z), b = proj(x1, y0, z), d = proj(x0, y1, z);
  ctx.save();
  ctx.transform((b.x - a.x) / img.width, (b.y - a.y) / img.width,
                (d.x - a.x) / img.height, (d.y - a.y) / img.height, a.x, a.y);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
function plateInner(x0, y0, x1, y1) {
  const sp = PLATE_INSET[APRON_PLATE];
  const w = x1 - x0, h = y1 - y0;
  return { x0: x0 + w * sp.l, x1: x0 + w * sp.r, y0: y0 + h * sp.t, y1: y0 + h * sp.b,
           cx: x0 + w * (sp.l + sp.r) / 2, cy: y0 + h * (sp.t + sp.b) / 2, w: w * (sp.r - sp.l), h: h * (sp.b - sp.t) };
}
function apronPanel(ctx, x0, y0, x1, y1, opts = {}) {
  const z = APRON_Z(), plate = CARDPLATE[APRON_PLATE];
  if (plate && !opts.forceDrawn) {
    ctx.save(); ctx.filter = 'blur(4px)'; ctx.fillStyle = 'rgba(4,6,12,0.45)';
    pathPoly(ctx, [[x0 + 4, y0 + 5], [x1 + 4, y0 + 5], [x1 + 4, y1 + 5], [x0 + 4, y1 + 5]].map(p => proj(p[0], p[1], z))); ctx.fill(); ctx.restore();
    drawImageQuad(ctx, plate, x0, y0, x1, y1);
    return;
  }
  const c = 13;
  const fp = [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
  const P = fp.map(p => proj(p[0], p[1], z));
  ctx.save();
  ctx.save(); ctx.filter = 'blur(4px)'; ctx.fillStyle = 'rgba(4,6,12,0.45)';
  pathPoly(ctx, fp.map(p => proj(p[0] + 4, p[1] + 5, z))); ctx.fill(); ctx.restore();
  const g = ctx.createLinearGradient(P[0].x, P[0].y, P[4].x, P[4].y);
  g.addColorStop(0, opts.top || '#1d3a5e'); g.addColorStop(1, opts.bot || '#0e1a2d');
  ctx.fillStyle = g; pathPoly(ctx, P); ctx.fill();
  ctx.strokeStyle = '#e8dfc8'; ctx.lineWidth = 2.6; pathPoly(ctx, P); ctx.stroke();
  ctx.strokeStyle = 'rgba(217,130,46,0.75)'; ctx.lineWidth = 1.3;
  pathPoly(ctx, fp.map(p => proj(p[0] + (p[0] < (x0 + x1) / 2 ? 6 : -6), p[1] + (p[1] < (y0 + y1) / 2 ? 6 : -6), z))); ctx.stroke();
  ctx.strokeStyle = '#e8dfc8'; ctx.lineWidth = 2.2;
  for (const [cx0, cy0, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
    const a = proj(cx0 + sx * 16, cy0 + sy * 3, z), b = proj(cx0 + sx * 3, cy0 + sy * 3, z), d = proj(cx0 + sx * 3, cy0 + sy * 16, z);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  }
  ctx.restore();
}
function apronBlock(ctx, lines, xCentre, ys, maxW, basePx, colour) {
  const z = APRON_Z();
  ctx.save();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.5px';
  const a = proj(xCentre - maxW / 2, ys[0], z), b = proj(xCentre + maxW / 2, ys[0], z);
  const maxPx = Math.abs(b.x - a.x);
  let size = basePx;
  for (; size > 7; size--) { ctx.font = '600 ' + size + 'px ' + APRON_FONT; if (lines.every(t => ctx.measureText(t).width <= maxPx)) break; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((t, i) => {
    const p = proj(xCentre, ys[i], z);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(t, p.x + 1, p.y + 1.2);
    ctx.fillStyle = colour || '#f2f6fa'; ctx.fillText(t, p.x, p.y);
  });
  ctx.restore();
}
function apronSwash(ctx, p0, p1, p2, widths, colour, endR) {
  const z = APRON_Z();
  ctx.save(); ctx.lineCap = 'round';
  widths.forEach((w, i) => {
    const off = i * 15;
    const q = t => { const u = 1 - t;
      return proj(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                  u * u * (p0[1] + off) + 2 * u * t * (p1[1] + off) + t * t * (p2[1] + off), z); };
    ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.05) { const p = q(t); t ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.stroke();
    const e = q(1); ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(e.x, e.y, endR - i * 1.1, 0, 7); ctx.fill();
  });
  ctx.restore();
}
function drawApronPrint(ctx) {
  // the swashes take the lightning's own orange (Ian, 2026-09-11) --- sampled
  // off the artwork: the bolts' dominant pixel is rgb(248,96,0)
  const SW = 'rgba(248,100,4,0.85)';
  apronSwash(ctx, [8, 1882], [124, 1874], [240, 1926], [10, 6.5, 4], SW, 9);
  apronSwash(ctx, [810, 1882], [720, 1874], [632, 1926], [10, 6.5, 4], SW, 9);
  apronSwash(ctx, [12, 1664], [100, 1676], [180, 1700], [7, 4.5], SW, 6);
  apronSwash(ctx, [800, 1664], [746, 1676], [692, 1700], [7, 4.5], SW, 6);
  const CW_ = 198, CH_ = 112, CY0 = 1746, CY1 = 1746 + CH_;
  // LEFT CARD --- how to play. This ships on mobile (Ian, 2026-09-11), so on a
  // touch device the card reads the touch controls game.html actually has;
  // the keyboard wording is for us testing on a desk.
  apronPanel(ctx, 30, CY0, 30 + CW_, CY1);
  { const p = plateInner(30, CY0, 30 + CW_, CY1);
    if ('ontouchstart' in window) {
      apronBlock(ctx, ['TAP LEFT — LEFT FLIPPER', 'TAP RIGHT — RIGHT FLIPPER', 'HOLD RIGHT EDGE — PLUNGE', 'SWIPE UP TOP — NUDGE'],
        p.cx, [p.cy - p.h * 0.375, p.cy - p.h * 0.125, p.cy + p.h * 0.125, p.cy + p.h * 0.375], p.w, 20, plateInk());
    } else {
      apronBlock(ctx, ['Z — LEFT FLIPPER', '/ — RIGHT FLIPPER', 'SPACE — PLUNGE'], p.cx, [p.cy - p.h * 0.33, p.cy, p.cy + p.h * 0.33], p.w, 26, plateInk());
    } }
  // RIGHT CARD --- the coin card; the high score itself is drawn live
  apronPanel(ctx, 640, CY0, 640 + CW_, CY1);
  { const p = plateInner(640, CY0, 640 + CW_, CY1);
    apronBlock(ctx, ['3 BALLS · 1 PLAY'], p.cx, [p.cy - p.h * 0.34], p.w, 26, plateInk());
    apronBlock(ctx, ['HIGH SCORE'], p.cx, [p.cy + p.h * 0.02], p.w, 16, plateInk()); }
  // centre bands, code-drawn, centred on the flipper axis (436)
  apronPanel(ctx, 282, 1882, 590, 1914, { forceDrawn: true, top: '#25456e', bot: '#132441' });
  apronBlock(ctx, ['FOR AMUSEMENT ONLY'], 436, [1898], 258, 18);
  apronPanel(ctx, 252, 1920, 620, 1956, { forceDrawn: true, top: '#2b4f7c', bot: '#14264a' });
  apronBlock(ctx, ['ARTABAN INTERACTIVE'], 436, [1938], 318, 24);
}
function drawApronLive(ctx) {
  if (S.score > HIGH) { HIGH = S.score; try { localStorage.setItem('th_high', String(HIGH)); } catch (e) {} }
  const p = plateInner(640, 1746, 838, 1858);
  apronBlock(ctx, [HIGH.toLocaleString()], p.cx, [p.cy + p.h * 0.34], p.w, 30, plateAccent());
}

// ============ THE LAUNCHER (lifted from the art build, 2026-08-26 design) ============
// Pinball-Deluxe style: no knob outside the cabinet, a full coiled spring with a
// tip, all inside the lane. Sea Witch-style housing: the spring lives in a RECESS
// below the playfield, seen through a window cut in a shaped plate, with
// graduations printed either side. A brightly lit spring lying on the playfield
// reads as a cartoon; the same spring glimpsed in shadow through an aperture
// reads as a mechanism. 8 coils, not 15: fifteen merge into mush when compressed.
// PLUNGER/LANE (the physics side) live in game.html.
const SPRING = { coils: 8, r: 13, gauge: 4.6, tipR: 21,
  wire: '#8b95a1', back: '#252c34', spec: 'rgba(220,234,246,0.6)' };
const S_SEAT_R = 18;   // spring seat at the foot of the housing
const S_COLLAR_R = 17; // flange under the tip that the top coil butts against
const HOUSING = {
  x0: 870, x1: 924,          // plate footprint across the lane
  yTop: 1612, yBot: 1898,
  winHalf: 19,               // window half-width
  winTop: 1626, winBot: 1890,
};
// Solid cabinet closing the lane below the housing: the ball can never get down
// there, so it should read as the end of the machine, not an open channel.
function drawLaneCap(ctx) {
  const { x0, x1 } = LANE, yTop = HOUSING.yBot - 4, yBot = 1976;
  const fp = [[x0 - 2, yTop], [x1 + 2, yTop], [x1 + 2, yBot], [x0 - 2, yBot]];
  prismShadowP(ctx, fp, 40, 0.3);
  prism(ctx, fp, 0, 40, '#3d4d5e', '#9fb0bd');
  // seam where the cap butts the housing, so it reads as two parts not one slab
  const a = proj(x0 - 2, yTop, 40), b = proj(x1 + 2, yTop, 40);
  ctx.save();
  ctx.strokeStyle = 'rgba(12,16,24,0.65)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(226,238,248,0.30)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(b.x, b.y - 2); ctx.stroke();
  ctx.restore();
}
function drawPlunger(ctx) {
  const { cx: lx } = LANE;
  const tipY = PLUNGER.tipY;
  drawLaneCap(ctx);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const H = HOUSING;
  // --- the plate, let into the playfield, with a raised border ---
  const plateFP = [[H.x0, H.yTop + 14], [H.x0 + 7, H.yTop + 2], [H.x1 - 7, H.yTop + 2],
                   [H.x1, H.yTop + 14], [H.x1, H.yBot], [H.x0, H.yBot]];
  prism(ctx, plateFP, 0, 4, '#2a323d', '#5d6b78');
  ctx.save();
  ctx.strokeStyle = '#8fa0ae'; ctx.lineWidth = 2.5;
  pathPoly(ctx, plateFP.map(p => proj(p[0], p[1], 4))); ctx.stroke();
  ctx.restore();

  // --- the window: a dark recess the mechanism is glimpsed through ---
  const winFP = [[lx - H.winHalf, H.winTop], [lx + H.winHalf, H.winTop],
                 [lx + H.winHalf, H.winBot], [lx - H.winHalf, H.winBot]];
  const winProj = winFP.map(p => proj(p[0], p[1], 4));
  ctx.save();
  pathPoly(ctx, winProj); ctx.clip();
  // recess interior: near-black at the walls so the aperture reads as a hole
  const rg = ctx.createLinearGradient(winProj[0].x, 0, winProj[1].x, 0);
  rg.addColorStop(0, '#010204'); rg.addColorStop(0.18, '#080b12');
  rg.addColorStop(0.5, '#151b26'); rg.addColorStop(0.82, '#080b12'); rg.addColorStop(1, '#010204');
  ctx.fillStyle = rg; pathPoly(ctx, winProj); ctx.fill();
  // lip shadow cast down into the recess from the plate's top edge
  const lipG = ctx.createLinearGradient(0, winProj[0].y, 0, winProj[0].y + 34);
  lipG.addColorStop(0, 'rgba(0,0,0,0.85)'); lipG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lipG; pathPoly(ctx, winProj); ctx.fill();

  // Guide shaft, running the length of the housing and THROUGH the spring, in
  // steel so it is visible in the gaps between coils --- that glimpse is most of
  // what sells the spring as threaded onto something rather than balanced in a hole.
  const gTop = proj(lx, tipY + 2, -5), gBot = proj(lx, H.yBot - 12, -5);
  ctx.strokeStyle = '#20262e'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(gBot.x, gBot.y); ctx.lineTo(gTop.x, gTop.y); ctx.stroke();
  ctx.strokeStyle = '#68737f'; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(gBot.x, gBot.y); ctx.lineTo(gTop.x, gTop.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,206,222,0.6)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(gBot.x - 1.4, gBot.y); ctx.lineTo(gTop.x - 1.4, gTop.y); ctx.stroke();
  // seat the spring stands on at the bottom of the housing
  const seat = proj(lx, H.yBot - 10, -3);
  ctx.fillStyle = '#454f5a';
  ctx.beginPath(); ctx.ellipse(seat.x, seat.y, S_SEAT_R, S_SEAT_R * 0.34, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#252c34'; ctx.lineWidth = 1.3; ctx.stroke();

  // THE SPRING: many short segments, each SHADED AND SIZED BY ITS DEPTH (cos of
  // the helix phase). Per-segment depth shading is what makes wire read as round;
  // a two-tone front/back split still looks like a flat ribbon. Ends are closed
  // ground coils (flat rings), which is what gives the tip a square seat.
  const S_ = SPRING;
  const sBot = H.yBot - 10;   // spring seats on the housing floor, not the table edge
  const solid = S_.coils * S_.gauge * 0.82;          // wire stacked on itself
  const sTop = Math.min(tipY + 11, sBot - solid);    // never invert past solid height
  const zMid = -6, zAmp = 9;
  const wireAt = (ph, y) => proj(lx + Math.sin(ph) * S_.r, y + Math.cos(ph) * 2.0, zMid + Math.cos(ph) * zAmp);
  const drawArc = (phA, phB, y0, y1, steps) => {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const p0 = wireAt(phA + (phB - phA) * t0, y0 + (y1 - y0) * t0);
      const p1 = wireAt(phA + (phB - phA) * t1, y0 + (y1 - y0) * t1);
      const dep = Math.cos(phA + (phB - phA) * (t0 + t1) / 2); // +1 near, -1 far
      const k = (dep + 1) / 2;
      ctx.strokeStyle = shade(S_.wire, 0.40 + 0.85 * k);
      ctx.lineWidth = S_.gauge * (0.66 + 0.34 * k);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      if (k > 0.62) { // specular only on the near face
        ctx.strokeStyle = S_.spec; ctx.lineWidth = S_.gauge * 0.26;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - S_.gauge * 0.28); ctx.lineTo(p1.x, p1.y - S_.gauge * 0.28);
        ctx.stroke();
      }
    }
  };
  drawArc(0, Math.PI * 2, sBot, sBot, 34);
  const pitch = (sBot - sTop) / S_.coils;
  for (let c = 0; c < S_.coils; c++) drawArc(0, Math.PI * 2, sTop + pitch * c, sTop + pitch * (c + 1), 26);
  drawArc(0, Math.PI * 2, sTop, sTop, 34);
  ctx.restore(); // release the window clip

  // --- graduations flanking the window, printed on the plate ---
  ctx.save();
  for (let i = 0; i <= 11; i++) {
    const y = H.winTop + 12 + (H.winBot - H.winTop - 24) * (i / 11);
    const major = i % 3 === 0;
    for (const s of [-1, 1]) {
      const a = proj(lx + s * (H.winHalf + 3), y, 4);
      const b = proj(lx + s * (H.winHalf + (major ? 15 : 10)), y, 4);
      ctx.strokeStyle = major ? 'rgba(232,223,200,0.8)' : 'rgba(170,190,205,0.45)';
      ctx.lineWidth = major ? 2.6 : 1.8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.restore();

  // --- the tip assembly: collar, then a turned steel cylinder ---
  // FACE ASPECT 0.13: the tip's circular face points UP THE LANE, away from this
  // camera, so it is strongly foreshortened (0.36 read as a disc lying flat).
  const FACE = 0.13;
  const colY = tipY + 6;
  const col = proj(lx, colY, 4), colB = proj(lx, colY, -1);
  ctx.fillStyle = '#39424d';
  ctx.beginPath();
  ctx.moveTo(col.x - S_COLLAR_R, col.y); ctx.lineTo(col.x + S_COLLAR_R, col.y);
  ctx.lineTo(colB.x + S_COLLAR_R, colB.y); ctx.lineTo(colB.x - S_COLLAR_R, colB.y);
  ctx.closePath(); ctx.fill();
  const colG = ctx.createLinearGradient(col.x - S_COLLAR_R, 0, col.x + S_COLLAR_R, 0);
  colG.addColorStop(0, '#5c6874'); colG.addColorStop(0.34, '#b6c2ce'); colG.addColorStop(1, '#4a545f');
  ctx.fillStyle = colG;
  ctx.beginPath(); ctx.ellipse(col.x, col.y, S_COLLAR_R, S_COLLAR_R * FACE, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2b333c'; ctx.lineWidth = 1.2; ctx.stroke();

  const tipZ = 17;
  const tTop = proj(lx, tipY, tipZ), tBot = proj(lx, colY, 3);
  const bodyG = ctx.createLinearGradient(tTop.x - S_.tipR, 0, tTop.x + S_.tipR, 0);
  bodyG.addColorStop(0, '#454e59'); bodyG.addColorStop(0.30, '#b2bec9');
  bodyG.addColorStop(0.56, '#7e8a96'); bodyG.addColorStop(1, '#3d454f');
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.moveTo(tTop.x - S_.tipR, tTop.y); ctx.lineTo(tTop.x + S_.tipR, tTop.y);
  ctx.lineTo(tBot.x + S_.tipR, tBot.y); ctx.lineTo(tBot.x - S_.tipR, tBot.y);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(tBot.x, tBot.y, S_.tipR, S_.tipR * FACE, 0, 0, Math.PI); ctx.fill();
  const capG = ctx.createLinearGradient(tTop.x - S_.tipR, tTop.y - 4, tTop.x + S_.tipR, tTop.y + 4);
  capG.addColorStop(0, '#f2f7fc'); capG.addColorStop(0.42, '#c7d2dd'); capG.addColorStop(1, '#69747f');
  ctx.fillStyle = capG;
  ctx.beginPath(); ctx.ellipse(tTop.x, tTop.y, S_.tipR, S_.tipR * FACE, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#333b45'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

// ============ the pipeline ============
let staticLayer = null, bumperSprites = [], capImg = null;
function underDeck(B) { return DECKS.some(d => pointInPoly(B.x, B.y, d.pts)); }
function drawBumperBody(ctx, B, BSP) {
  prismShadowBumper(ctx, B, BSP.H);
  ctx.drawImage(BSP.base.c, BSP.base.ox, BSP.base.oy);
  ctx.drawImage(BSP.ring.c, BSP.ring.ox, BSP.ring.oy);
  ctx.drawImage(BSP.cap.c, BSP.cap.ox, BSP.cap.oy);
}
function drawBumperLamp(ctx, BSP, hot) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55 + 0.35 * clamp(hot / 6, 0, 1);
  ctx.drawImage(BSP.lit.c, BSP.lit.ox, BSP.lit.oy);
  if (hot > 0) { ctx.globalAlpha = clamp(hot / 6, 0, 1) * 0.8; ctx.drawImage(BSP.litBlur.c, BSP.litBlur.ox, BSP.litBlur.oy); }
  ctx.restore();
}
function buildStaticLayer() {
  staticLayer = document.getElementById('cs') || (staticLayer || document.createElement('canvas'));
  const k = R25.SC * DPR();
  staticLayer.width = Math.round(R25.CW * k); staticLayer.height = Math.round(R25.CH * k);
  const sc = staticLayer.getContext('2d'); sc.setTransform(k, 0, 0, k, 0, 0);
  sc.fillStyle = '#05060a'; sc.fillRect(0, 0, R25.CW, R25.CH);
  drawPlayfieldPersp(sc);
  drawWalls25(sc);
  drawApronPrint(sc);
  drawBankStatic(sc);
  for (const bw of BOWLS) drawBowlStatic(sc, bw);
  drawInsertsStatic(sc);
  // bumpers that live under a canopy are part of the floor the canopy covers:
  // they go in BEFORE the slab so the glass sits over them, not under them
  for (let i = 0; i < GEO.bumpers.length; i++) if (underDeck(GEO.bumpers[i])) drawBumperBody(sc, GEO.bumpers[i], bumperSprites[i]);
  for (const d of DECKS) drawDeckStatic(sc, d);
  // ramps AFTER the decks: the serpentine's last stretch descends onto the
  // canopy's surface and the drain rail leaves from it; drawn before the slab
  // they read as diving under it (Ian, 2026-09-13)
  drawRamps25(sc);
}
// re-fit the camera and re-bake the print when the frame changes size (phone
// rotation, viewport change); sprites and the playfield composite stay
function r25relayout() {
  if (!R25.ready) return;
  setupCamera(GEO.W, GEO.H);
  // the bumper sprites carry projected positions from the bake; a new camera
  // (the phone's taller frame) needs them re-baked or the nest lands elsewhere
  // (Ian, 2026-09-13: "the bumper nest got misplaced visually")
  bumperSprites = GEO.bumpers.map(bp => bakeBumper(bp, capImg));
  buildStaticLayer();
}
function r25init() {
  if (R25.ready || !GEO) return;
  setupCamera(GEO.W, GEO.H);
  const wq = parseInt(new URLSearchParams(location.search).get('walls') || '', 10);
  applyWallPalette(Number.isFinite(wq) ? wq - 1 : 8, false);   // 9 cream --- Ian's pick, 2026-09-11
  R25.palShownUntil = 0;
  pfc = document.createElement('canvas'); pfc.width = GEO.W; pfc.height = GEO.H;
  const pctx = pfc.getContext('2d');
  if (typeof ARTOK !== 'undefined' && ARTOK) {
    pctx.drawImage(ART, 0, 0, GEO.W, GEO.H);
    // the print darker (Ian, 2026-09-13), so the parchment hardware sits on it
    pctx.fillStyle = 'rgba(0,0,0,0.22)'; pctx.fillRect(0, 0, GEO.W, GEO.H);   // 10% was not enough on the Pixel; 22%
  } else { pctx.fillStyle = '#12182a'; pctx.fillRect(0, 0, GEO.W, GEO.H); }
  bumperSprites = GEO.bumpers.map(bp => bakeBumper(bp, capImg));
  buildStaticLayer();
  R25.ready = true;
}
// the cap decal loads on its own; if it arrives after init, re-bake once
(() => {
  const im = new Image();
  im.onload = () => { capImg = im; if (R25.ready) { bumperSprites = GEO.bumpers.map(bp => bakeBumper(bp, capImg)); } };
  im.onerror = () => { capImg = null; };
  im.src = 'thead-cap.png';
})();
// the print may also arrive after init (it is what the strips are baked from)
function r25artArrived() {
  if (!R25.ready) return;
  const pctx = pfc.getContext('2d'); pctx.drawImage(ART, 0, 0, GEO.W, GEO.H);
  buildStaticLayer();
}

// ============ FRAMING (Ian, 2026-09-12: "let's try 3 for now") ============
// Two framings, no chase. CLOSE: a single ball in play, the table zoomed 1.25x
// about the flippers --- crops only the apron corners (print, not play area);
// the camera pans up, eased, only when the ball climbs above the top margin,
// and drops back when it comes down. FULL: ball in the shooter lane, multiball,
// or attract --- the whole table, as before. Transitions ease over ~0.4 s.
// The HUD strip and the message banner are screen-space and never move.
// F toggles the whole feature for comparison.
// OFF by default (Ian, 2026-09-12: "new camera is really janky"); F turns it on
const FRAME = { enabled: false, CLOSE: 1.25, k: 1, oy: 0, last: 0, TOP_MARGIN: 260, BOTTOM_MARGIN: 200 };
function frameUpdate() {
  const CW = R25.CW, TH_ = R25.CH - LAYOUT.bottom;
  const now = performance.now(), dt = Math.min(0.1, (now - (FRAME.last || now)) / 1000); FRAME.last = now;
  const one = S.balls.length === 1 ? S.balls[0] : null;
  const inLane = one && one.x > GEO.W - 130 && one.y > GEO.H - 900;
  const close = FRAME.enabled && !S.over && one && !R.multiball && !inLane;
  const tk = close ? FRAME.CLOSE : 1;
  FRAME.k += (tk - FRAME.k) * Math.min(1, dt * 7);
  const k = FRAME.k;
  // bottom-anchored by default; pan up only to keep the ball inside the margins
  const oyMax = TH_ * (1 - 1 / k);
  let toy = oyMax;
  if (close && one) {
    const p = proj(one.x, one.y, 26 + (one.z || 0));
    const sy = (p.y - FRAME.oy) * k;
    if (sy < FRAME.TOP_MARGIN) toy = p.y - FRAME.TOP_MARGIN / k;
    else if (sy > TH_ - FRAME.BOTTOM_MARGIN) toy = p.y - (TH_ - FRAME.BOTTOM_MARGIN) / k;
    else toy = FRAME.oy;
    toy = Math.max(0, Math.min(oyMax, toy));
  }
  FRAME.oy += (toy - FRAME.oy) * Math.min(1, dt * 6);
  if (Math.abs(k - 1) < 0.002) { FRAME.k = 1; FRAME.oy = 0; }
  return { k: FRAME.k, oy: FRAME.oy, ox: CW / 2 * (1 - FRAME.k) };
}

// a flipper-shaped button in the phone's control bar; lit while that flipper is held
function drawFlipperButton(ctx, x, y, side, lit) {
  // at rest the bat hangs at its natural downward angle, tip toward the middle;
  // while held it flips up (Ian, 2026-09-13: "make them idle")
  ctx.save(); ctx.translate(x, y); if (side === 'R') ctx.scale(-1, 1); ctx.rotate(lit ? -0.4 : 0.45);
  ctx.fillStyle = lit ? '#f0dc94' : '#2c3644'; ctx.strokeStyle = lit ? '#fff6d0' : '#6b7d94'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-70, -22); ctx.lineTo(70, -9); ctx.lineTo(70, 9); ctx.lineTo(-70, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-70, 0, 26, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = lit ? '#8a6a26' : '#8fa8c8'; ctx.beginPath(); ctx.arc(-70, 0, 7, 0, 7); ctx.fill();
  ctx.restore();
}
// THE PLUNGE PROMPT (Ian, 2026-09-13, from a reference screenshot): a hand at
// the plunger with the instruction, while a ball waits on the tip and the
// player has plunged fewer than twice this game.
function drawPlungePrompt(ctx) {
  const t = performance.now() / 1000, bob = Math.sin(t * 4) * 10;
  const p = proj(LANE.cx, 1560 + bob, 60), q = proj(LANE.cx - 150, 1500, 60);
  ctx.save();
  // the hand: palm + pointing finger, white with a dark outline
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1e28'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 30, 22, 26, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(p.x - 9, p.y - 34, 18, 60, 9); ctx.fill(); ctx.stroke();
  // pull arrow, down the lane
  ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.x + 40, p.y - 30); ctx.lineTo(p.x + 40, p.y + 50); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x + 26, p.y + 36); ctx.lineTo(p.x + 40, p.y + 52); ctx.lineTo(p.x + 54, p.y + 36); ctx.stroke();
  // the words, on a dark tag to the left of the lane
  ctx.font = 'bold 30px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const w = ctx.measureText('HOLD  ·  RELEASE').width + 30;
  ctx.fillStyle = 'rgba(8,12,22,0.8)'; ctx.fillRect(q.x - w, q.y - 24, w, 48);
  ctx.fillStyle = '#ffe27a'; ctx.fillText('HOLD  ·  RELEASE', q.x - 15, q.y);
  ctx.restore();
}
function render25() {
  const CW = R25.CW, CH = R25.CH;
  { const now = performance.now(); if (R25.lastT) { const inst = 1000 / Math.max(1, now - R25.lastT); R25.fps += (inst - R25.fps) * 0.08; } R25.lastT = now; }
  const fr = frameUpdate();
  cx.save();
  cx.beginPath(); cx.rect(0, LAYOUT.top, CW, LAYOUT.tableH); cx.clip();   // the table never draws over the bars
  cx.transform(fr.k, 0, 0, fr.k, fr.ox, -fr.oy * fr.k);
  cx.clearRect(0, 0, CW, CH);   // transparent over the static canvas
  // the bank: inserts on the print first, then the standing targets
  drawBankInserts(cx);
  drawInsertsLive(cx);
  for (let i = 0; i < GEO.drops.length; i++) { if (S.drops[i]) drawDrop25(cx, GEO.drops[i]); else drawDropDown25(cx, GEO.drops[i]); }
  // rollovers: flat rings on the print, lit when collected
  for (let i = 0; i < GEO.lanes.length; i++) {
    const l = GEO.lanes[i], on = !!S.lanes[i];
    circle3(cx, l.x, l.y, 0.6, 22, 24);
    cx.strokeStyle = on ? '#7fe8a0' : 'rgba(80,120,100,0.8)'; cx.lineWidth = on ? 4 : 2.5; cx.stroke();
    if (on) { cx.fillStyle = 'rgba(127,232,160,0.28)'; cx.fill(); }
  }
  // the eyes, only while the giant is lit
  if (R.faceLit) for (let i = 0; i < GEO.eyes.length; i++) {
    const ey = GEO.eyes[i], on = R.eyes[i], pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160 + i);
    circle3(cx, ey.x, ey.y, 1, 40, 32);
    cx.fillStyle = on ? 'rgba(255,220,120,0.35)' : `rgba(255,140,40,${(0.12 * pulse).toFixed(3)})`; cx.fill();
    cx.strokeStyle = on ? '#fff1a8' : `rgba(255,170,60,${pulse.toFixed(3)})`; cx.lineWidth = on ? 6 : 4; cx.stroke();
  }
  // the mouth, once both eyes have opened it: the lightning's orange, faster pulse
  if (R.mouthOpen && GEO.mouth) {
    const mo = GEO.mouth, pulse = 0.55 + 0.45 * Math.sin(performance.now() / 120);
    circle3(cx, mo.x, mo.y, 1, mo.r, 36);
    cx.fillStyle = `rgba(248,100,4,${(0.16 * pulse).toFixed(3)})`; cx.fill();
    cx.strokeStyle = `rgba(248,100,4,${pulse.toFixed(3)})`; cx.lineWidth = 6; cx.stroke();
  }
  // gated ramp mouths: a drop gate across the entrance --- a raised plate with
  // a red lamp bar while the bank stands, dropped flush once it is swept
  // (Ian, 2026-09-12: "the closed canopy ramp entrance [needs] some sort of
  // visual block"). Render only: the physics gate is rampEntry's gatedBy test.
  for (const r of RAMPS) {
    if (r.gatedBy == null) continue;
    const shut = !S.rampOpen[r.name], g = r.gate;
    if (!g) continue;
    // the PHYSICS gate segment, thickened along its own normal (the gate may be tilted off the ramp axis)
    const sx = g.x2 - g.x1, sy = g.y2 - g.y1, sl = Math.hypot(sx, sy) || 1, ux = sx / sl, uy = sy / sl, nx = -uy, ny = ux, th = g.th;
    const fp = [[g.x1 - nx * th, g.y1 - ny * th], [g.x2 - nx * th, g.y2 - ny * th], [g.x2 + nx * th, g.y2 + ny * th], [g.x1 + nx * th, g.y1 + ny * th]];
    if (shut) {
      prismShadowP(cx, fp, 34, 0.35);
      prism(cx, fp, 0, 34, '#3a1414', '#7a2a2a');
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 220);
      cx.save(); cx.strokeStyle = `rgba(255,80,60,${pulse.toFixed(3)})`; cx.lineWidth = 4; cx.lineCap = 'round';
      const a = proj(g.x1 + ux * 6, g.y1 + uy * 6, 34.5), b = proj(g.x2 - ux * 6, g.y2 - uy * 6, 34.5);
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
      if (!FX.low) { cx.globalCompositeOperation = 'lighter'; cx.filter = 'blur(5px)'; cx.globalAlpha = 0.5 * pulse; cx.stroke(); } cx.restore();
    } else {
      prism(cx, fp, 0, 2.5, '#2a3040', '#55607a');               // dropped flush: a plate in the print
    }
  }
  // flippers at their live angle
  for (const f of GEO.flippers) drawFlipper25(cx, f, f.side === 'L' ? S.angL : S.angR);
  GEO.slings.forEach((s, i) => drawSling25(cx, s, (typeof slingHot !== 'undefined' && slingHot[i] > 0)));
  drawApronLive(cx);
  drawPlunger(cx); // before the ball, so the ball correctly occludes the rod
  if ((S.plungeCount || 0) < 2 && !S.plunging && S.balls.length === 1) {
    const b = S.balls[0];
    if (b.x > GEO.W - 130 && b.y > 1740 && Math.abs(b.vy) < 5) drawPlungePrompt(cx);
  }
  for (let i = 0; i < GEO.bumpers.length; i++) {
    const B = GEO.bumpers[i];
    if (!underDeck(B)) drawBumperBody(cx, B, bumperSprites[i]);
    drawBumperLamp(cx, bumperSprites[i], B.hot || 0);
  }
  // a full lock shows the ball it is holding
  for (const bw of BOWLS) if (bw.lock && bw.occupied) drawBall25(cx, bw.x, bw.y, 26 + bw.zFloor, BALL_R);
  // 26 = resting on the print; b.z lifts it onto a rail, the deck, or the cone
  for (const b of S.balls) drawBall25(cx, b.x, b.y, 26 + (b.z || 0), BALL_R);
  bankOcclude(cx);
  for (const d of DECKS) {
    const under = S.balls.some(b => (b.deck == null || b.deck === undefined) && (b.z || 0) < d.z - 5 && pointInPoly(b.x, b.y, d.pts));
    if (!under) continue;
    cx.fillStyle = `rgba(170,195,235,${CANOPY_A.top})`;
    pathPoly(cx, d.pts.map(p => proj(p[0], p[1], d.z))); cx.fill();
  }

  cx.restore();   // back to screen space for the HUD
  // ---- HUD: screen space. Desktop: one strip under the table. Phone: a score
  // bar above and a control bar (flipper buttons, hint) below. Both bars are
  // repainted every frame: the table draw is clipped to its own region, so
  // nothing else clears them (the 2026-09-12 score pile-up).
  const hy = CH - LAYOUT.bottom, phone = !!R25.phone, mono = 'ui-monospace,monospace';
  cx.fillStyle = '#05060a'; cx.fillRect(0, hy, CW, LAYOUT.bottom); if (LAYOUT.top) cx.fillRect(0, 0, CW, LAYOUT.top);
  if (phone) {
    cx.fillStyle = '#e0b95a'; cx.font = 'bold 86px ' + mono; cx.textAlign = 'left'; cx.fillText(S.score.toLocaleString(), 30, 104);
    cx.textAlign = 'right'; cx.font = 'bold 40px ' + mono; cx.fillStyle = '#8fa8c8'; cx.fillText('BALLS ' + Math.max(0, S.ballsLeft), CW - 30, 64);
    cx.font = '28px ' + mono; cx.fillStyle = R.level > 1 ? '#ffb054' : '#8fa8c8';
    cx.fillText('STORM ' + 'I'.repeat(R.level) + '   LOCKS ' + R.locks + '/' + LOCKS_FOR_MULTIBALL, CW - 30, 114);
    const by = hy + LAYOUT.bottom * 0.5;
    drawFlipperButton(cx, 170, by, 'L', S.flipL); drawFlipperButton(cx, CW - 170, by, 'R', S.flipR);
    const hint = hudHint(); if (hint) { cx.textAlign = 'center'; cx.font = '30px ' + mono; cx.fillStyle = R.multiball ? '#7fe8ff' : '#8fa8c8'; cx.fillText(hint, CW / 2, by + 78); }
  } else {
    cx.fillStyle = '#e0b95a'; cx.font = 'bold 52px ' + mono; cx.textAlign = 'left';
    cx.fillText(S.score.toLocaleString(), 30, hy + 58);
    cx.font = '26px ' + mono; cx.fillStyle = '#8fa8c8';
    cx.fillText('BALLS ' + Math.max(0, S.ballsLeft), 30, hy + 96);
    cx.textAlign = 'right';
    cx.fillStyle = R.level > 1 ? '#ffb054' : '#8fa8c8';
    cx.fillText('STORM ' + 'I'.repeat(R.level), CW - 30, hy + 58);
    cx.fillStyle = '#8fa8c8';
    cx.fillText('LOCKS ' + R.locks + '/' + LOCKS_FOR_MULTIBALL + (R.mbLit ? '  LIT' : ''), CW - 30, hy + 96);
    { const hint = hudHint(); if (hint) { cx.textAlign = 'center'; cx.fillStyle = R.multiball ? '#7fe8ff' : '#8fa8c8'; cx.fillText(hint, CW / 2, hy + 96); } }
    if (performance.now() < (R25.palShownUntil || 0)) {
      cx.textAlign = 'center'; cx.fillStyle = '#e0b95a'; cx.font = '22px ' + mono;
      cx.fillText('WALLS ' + (R25.pal + 1) + ' — ' + WALL_PALETTES[R25.pal][0] + '   [ ] to cycle', CW / 2, hy + 58);
    }
  }
  // WEB BUILD: the fps/fx readout is a developer's instrument, not something a
  // visitor should see. ?fps=1 brings it back for diagnosing a slow phone.
  if (new URLSearchParams(location.search).get('fps') === '1') {
    cx.font = '16px ' + mono; cx.fillStyle = 'rgba(143,168,200,0.55)'; cx.textAlign = 'right';
    cx.fillText(Math.round(R25.fps) + ' fps ' + (FX.low ? 'low' : 'high') + ' fx', CW - 30, hy + LAYOUT.bottom - 10);
  }
  // music toggle: a note, struck through when off (M key, or tap it)
  { const x = MUSBTN.x, y = MUSBTN.y, on = MUSIC.on;
    cx.save();
    cx.strokeStyle = on ? '#8fa8c8' : '#4a5568'; cx.fillStyle = on ? '#8fa8c8' : '#4a5568';
    cx.lineWidth = 3; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(x + 7, y - 13); cx.lineTo(x + 7, y + 7); cx.stroke();   // stem
    cx.beginPath(); cx.ellipse(x, y + 8, 8, 6, -0.3, 0, 7); cx.fill();                // head
    cx.beginPath(); cx.moveTo(x + 7, y - 13); cx.quadraticCurveTo(x + 20, y - 10, x + 17, y - 1); cx.stroke(); // flag
    if (!on) { cx.strokeStyle = '#c05a4a'; cx.beginPath(); cx.moveTo(x - 13, y + 16); cx.lineTo(x + 24, y - 18); cx.stroke(); }
    cx.restore(); }
  cx.textAlign = 'left';
  if (S.msgT > 0 || S.over) {
    cx.save();
    cx.globalAlpha = S.over ? 1 : Math.min(1, S.msgT / 120);
    cx.textAlign = 'center'; cx.font = 'bold 40px ui-monospace,monospace';
    const tw = cx.measureText(S.msg).width;
    cx.fillStyle = 'rgba(8,12,22,0.72)';
    cx.fillRect(CW / 2 - tw / 2 - 22, CH * 0.5 - 40, tw + 44, 56);
    cx.fillStyle = '#ffe27a'; cx.fillText(S.msg, CW / 2, CH * 0.5);
    cx.restore();
  }
}
