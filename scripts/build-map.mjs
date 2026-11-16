// 从 Overpass 原始数据生成带路名的 SVG 底图
// 用法: node scripts/build-map.mjs [原始JSON] [输出SVG]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RAW = process.argv[2] || path.join(os.tmpdir(), 'osm_raw.json');
const OUT = process.argv[3] || path.resolve('assets/img/haigang.svg');

const W = 1000, H = 620;
const BBOX = { s: 39.87, w: 119.48, n: 39.99, e: 119.72 };

const data = JSON.parse(fs.readFileSync(RAW, 'utf8'));

/* ---------- 投影 ---------- */

const lat0 = (BBOX.s + BBOX.n) / 2;
const kx = Math.cos((lat0 * Math.PI) / 180);
const dx = (BBOX.e - BBOX.w) * kx;
const dy = BBOX.n - BBOX.s;
const scale = Math.min(W / dx, H / dy);
const offX = (W - dx * scale) / 2;
const offY = (H - dy * scale) / 2;

function proj(lat, lon) {
  return [
    +(((lon - BBOX.w) * kx * scale) + offX).toFixed(1),
    +(((BBOX.n - lat) * scale) + offY).toFixed(1)
  ];
}

function toPath(geom) {
  if (!geom || geom.length < 2) return null;
  let d = '';
  for (let i = 0; i < geom.length; i++) {
    const p = proj(geom[i].lat, geom[i].lon);
    d += (i ? 'L' : 'M') + p[0] + ' ' + p[1];
  }
  return d;
}

function centroid(geom) {
  const pts = geom.map(g => proj(g.lat, g.lon));
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function length(geom) {
  const pts = geom.map(g => proj(g.lat, g.lon));
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return len;
}

function midPoint(geom) {
  const pts = geom.map(g => proj(g.lat, g.lon));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= total / 2) {
      const t = (total / 2 - acc) / (seg || 1);
      return {
        x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
        y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
        angle: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI
      };
    }
    acc += seg;
  }
  return null;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- 分类 ---------- */

const water = [], parks = [], roads = { motorway: [], trunk: [], primary: [], secondary: [], tertiary: [] }, places = [];

for (const el of data.elements) {
  if (el.type === 'node' && el.tags && el.tags.place && el.tags.name) {
    places.push({ name: el.tags.name, kind: el.tags.place, ...(() => {
      const p = proj(el.lat, el.lon);
      return { x: p[0], y: p[1] };
    })() });
    continue;
  }
  if (el.type !== 'way' || !el.geometry) continue;

  const t = el.tags || {};
  if (t.natural === 'water') { const d = toPath(el.geometry); if (d) water.push(d); continue; }
  if (t.leisure === 'park') { const d = toPath(el.geometry); if (d) parks.push(d); continue; }
  if (t.highway && roads[t.highway]) {
    const d = toPath(el.geometry);
    if (d) roads[t.highway].push({ d, name: t.name || '', len: length(el.geometry), geom: el.geometry });
  }
}

/* ---------- 路名：同名只标最长的一条 ---------- */

const ROAD_STYLE = {
  motorway: { w: 4.6, fill: '#f0c469', casing: '#d9a94f' },
  trunk: { w: 4.0, fill: '#f4d28a', casing: '#dcb768' },
  primary: { w: 3.2, fill: '#fbe6bd', casing: '#d8c39a' },
  secondary: { w: 2.4, fill: '#ffffff', casing: '#d6cfc1' },
  tertiary: { w: 1.7, fill: '#ffffff', casing: '#ddd6c9' }
};

function buildRoadLabels() {
  const byName = new Map();
  for (const cls of Object.keys(roads)) {
    for (const r of roads[cls]) {
      if (!r.name) continue;
      const prev = byName.get(r.name);
      if (!prev || r.len > prev.len) byName.set(r.name, r);
    }
  }
  const out = [];
  for (const [name, r] of byName) {
    const m = midPoint(r.geom);
    if (!m || m.x < 10 || m.x > W - 10 || m.y < 10 || m.y > H - 10) continue;
    let angle = m.angle;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    out.push({ name, x: m.x, y: m.y, angle });
  }
  return out.slice(0, 70);
}

/* ---------- 拼 SVG ---------- */

const parts = [];
parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="海港区底图，数据来自 OpenStreetMap">`);
parts.push(`<title>海港区底图</title>`);
parts.push(`<rect width="${W}" height="${H}" fill="#f7f5f1"/>`);

if (water.length) parts.push(`<g fill="#d5e7f0">${water.map(d => `<path d="${d}"/>`).join('')}</g>`);
if (parks.length) parts.push(`<g fill="#dfeada">${parks.map(d => `<path d="${d}"/>`).join('')}</g>`);

// 路面：先描边（casing），再填色
const order = ['tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
for (const cls of order) {
  const st = ROAD_STYLE[cls];
  const list = roads[cls];
  if (!list.length) continue;
  parts.push(`<g fill="none" stroke="${st.casing}" stroke-width="${st.w + 2.2}" stroke-linecap="round" stroke-linejoin="round">` +
    list.map(r => `<path d="${r.d}"/>`).join('') + `</g>`);
}
for (const cls of order) {
  const st = ROAD_STYLE[cls];
  const list = roads[cls];
  if (!list.length) continue;
  parts.push(`<g fill="none" stroke="${st.fill}" stroke-width="${st.w}" stroke-linecap="round" stroke-linejoin="round">` +
    list.map(r => `<path d="${r.d}"/>`).join('') + `</g>`);
}

// 地名
const placeSize = { city: 15, town: 13, suburb: 12, neighbourhood: 11, village: 11 };
for (const p of places) {
  const size = placeSize[p.kind] || 11;
  parts.push(`<text x="${p.x}" y="${p.y}" font-size="${size}" font-weight="${p.kind === 'village' ? 400 : 600}" ` +
    `fill="#4a4a46" text-anchor="middle" paint-order="stroke" stroke="#f7f5f1" stroke-width="3" stroke-linejoin="round">${esc(p.name)}</text>`);
}

// 路名
for (const l of buildRoadLabels()) {
  parts.push(`<text x="${l.x}" y="${l.y}" font-size="9" fill="#6b6a64" text-anchor="middle" ` +
    `transform="rotate(${l.angle.toFixed(1)} ${l.x} ${l.y})" paint-order="stroke" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">${esc(l.name)}</text>`);
}

// 比例尺与版权
const kmPerPx = 111.32 / scale;
const barKm = 2;
const barPx = barKm / kmPerPx;
const bx = 22, by = H - 26;
parts.push(`<g stroke="#6b6a64" stroke-width="1.4"><line x1="${bx}" y1="${by}" x2="${bx + barPx}" y2="${by}"/>` +
  `<line x1="${bx}" y1="${by - 4}" x2="${bx}" y2="${by + 4}"/>` +
  `<line x1="${bx + barPx}" y1="${by - 4}" x2="${bx + barPx}" y2="${by + 4}"/></g>`);
parts.push(`<text x="${bx + barPx + 8}" y="${by + 4}" font-size="10" fill="#6b6a64">${barKm} km</text>`);
parts.push(`<text x="${W - 10}" y="${H - 10}" font-size="9" fill="#8a887f" text-anchor="end">© OpenStreetMap contributors</text>`);

parts.push(`</svg>`);

const svg = parts.join('\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg, 'utf8');

console.log(`水体 ${water.length}，公园 ${parks.length}，地名 ${places.length}`);
console.log('道路：' + Object.keys(roads).map(c => c + '=' + roads[c].length).join(' '));
console.log('路名标签：' + buildRoadLabels().length);
console.log(`输出 ${OUT}（${(svg.length / 1024).toFixed(0)} KB）`);
