// 从 Overpass 原始数据生成：几何底图 + 分级标签
// 用法: node scripts/build-map.mjs [道路水利JSON] [POI JSON]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');

const RAW = process.argv[2] || path.join(os.tmpdir(), 'osm_raw.json');
const POI = process.argv[3] || path.join(os.tmpdir(), 'osm_poi.json');
const OUT_SVG = path.join(SITE, 'assets/img/haigang.svg');
const OUT_LABELS = path.join(SITE, 'data/labels.js');

const W = 1000, H = 620;
const BBOX = { s: 39.87, w: 119.48, n: 39.99, e: 119.72 };

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const poi = fs.existsSync(POI) ? JSON.parse(fs.readFileSync(POI, 'utf8')) : { elements: [] };

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

function length(geom) {
  const pts = geom.map(g => proj(g.lat, g.lon));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
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
        x: +(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t).toFixed(1),
        y: +(pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t).toFixed(1),
        a: +(Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI).toFixed(1)
      };
    }
    acc += seg;
  }
  return null;
}

function centroid(geom) {
  const pts = geom.map(g => proj(g.lat, g.lon));
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [+(x / pts.length).toFixed(1), +(y / pts.length).toFixed(1)];
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- 几何 ---------- */

const water = [], parks = [];
const roads = { motorway: [], trunk: [], primary: [], secondary: [], tertiary: [] };

for (const el of raw.elements) {
  if (el.type !== 'way' || !el.geometry) continue;
  const t = el.tags || {};
  if (t.natural === 'water') { const d = toPath(el.geometry); if (d) water.push(d); continue; }
  if (t.leisure === 'park') { const d = toPath(el.geometry); if (d) parks.push(d); continue; }
  if (t.highway && roads[t.highway]) {
    const d = toPath(el.geometry);
    if (d) roads[t.highway].push({ d, name: t.name || '', len: length(el.geometry), geom: el.geometry });
  }
}

const parts = [];
parts.push('<?xml version="1.0" encoding="UTF-8"?>');
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="海港区底图，数据来自 OpenStreetMap，© OpenStreetMap contributors">`);
parts.push('<title>海港区底图</title>');
parts.push(`<rect width="${W}" height="${H}" fill="#f7f5f1"/>`);
if (water.length) parts.push(`<g fill="#d5e7f0">${water.map(d => `<path d="${d}"/>`).join('')}</g>`);
if (parks.length) parts.push(`<g fill="#dfeada">${parks.map(d => `<path d="${d}"/>`).join('')}</g>`);

const ROAD_STYLE = {
  motorway: { w: 4.6, fill: '#f0c469', casing: '#d9a94f' },
  trunk: { w: 4.0, fill: '#f4d28a', casing: '#dcb768' },
  primary: { w: 3.2, fill: '#fbe6bd', casing: '#d8c39a' },
  secondary: { w: 2.4, fill: '#ffffff', casing: '#d6cfc1' },
  tertiary: { w: 1.7, fill: '#ffffff', casing: '#ddd6c9' }
};
const order = ['tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
for (const cls of order) {
  const st = ROAD_STYLE[cls];
  if (!roads[cls].length) continue;
  parts.push(`<g fill="none" stroke="${st.casing}" stroke-width="${st.w + 2.2}" stroke-linecap="round" stroke-linejoin="round">` +
    roads[cls].map(r => `<path d="${r.d}"/>`).join('') + '</g>');
}
for (const cls of order) {
  const st = ROAD_STYLE[cls];
  if (!roads[cls].length) continue;
  parts.push(`<g fill="none" stroke="${st.fill}" stroke-width="${st.w}" stroke-linecap="round" stroke-linejoin="round">` +
    roads[cls].map(r => `<path d="${r.d}"/>`).join('') + '</g>');
}
parts.push('</svg>');

fs.mkdirSync(path.dirname(OUT_SVG), { recursive: true });
fs.writeFileSync(OUT_SVG, parts.join('\n'), 'utf8');

/* ---------- 标签 ---------- */

const labels = [];

// 1 层：行政区与地名
const placeRank = { city: 1, town: 2, suburb: 3, neighbourhood: 4, village: 5 };
for (const el of raw.elements) {
  if (el.type !== 'node' || !el.tags || !el.tags.place || !el.tags.name) continue;
  const p = proj(el.lat, el.lon);
  labels.push({
    n: el.tags.name, x: p[0], y: p[1], t: 1,
    k: el.tags.place,
    r: placeRank[el.tags.place] || 6
  });
}

// 2 层：水体与公园
for (const el of raw.elements) {
  if (el.type !== 'way' || !el.geometry || !el.tags) continue;
  const t = el.tags;
  if ((t.natural === 'water' || t.leisure === 'park') && t.name) {
    const c = centroid(el.geometry);
    labels.push({
      n: t.name, x: c[0], y: c[1], t: 2,
      k: t.natural === 'water' ? 'water' : 'park',
      r: t.natural === 'water' ? 6 : 7
    });
  }
}

// 2 层：主干路名（同名只留最长）
const byName = new Map();
for (const cls of order) {
  for (const r of roads[cls]) {
    if (!r.name) continue;
    const prev = byName.get(r.name);
    if (!prev || r.len > prev.len) byName.set(r.name, r);
  }
}
for (const [name, r] of byName) {
  const m = midPoint(r.geom);
  if (!m) continue;
  let a = m.a;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  labels.push({ n: name, x: m.x, y: m.y, t: 2, k: 'road', a: +a.toFixed(1), r: 8 });
}

// 3 层：POI
const POI_RANK = {
  hospital: 9, university: 9, college: 10, station: 9,
  mall: 10, townhall: 10, museum: 10, theatre: 10, cinema: 10,
  marketplace: 11, school: 11, clinic: 11, bus_station: 11,
  park: 12, sports_centre: 12, attraction: 12, zoo: 12
};
const seenPoi = new Set();
for (const el of poi.elements) {
  const t = el.tags || {};
  if (!t.name) continue;
  const kind = t.amenity || t.shop || t.railway || t.tourism || t.leisure;
  if (!kind) continue;

  const key = t.name + '|' + kind;
  if (seenPoi.has(key)) continue;
  seenPoi.add(key);

  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
  if (lat == null || lon == null) continue;

  const p = proj(lat, lon);
  labels.push({
    n: t.name, x: p[0], y: p[1], t: 3,
    k: kind === 'railway' ? 'station' : kind,
    r: POI_RANK[kind] || 13
  });
}

// 去重（同名同位置）
const unique = [];
const seen = new Set();
for (const l of labels) {
  const key = l.n + '|' + Math.round(l.x) + '|' + Math.round(l.y);
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(l);
}

const js = '/* 由 scripts/build-map.mjs 生成，不要手改。\n' +
  '   t=1 大范围（区/街道/镇），t=2 中范围（路名/水体/公园），t=3 小范围（POI）。*/\n' +
  'window.SF_LABELS = ' + JSON.stringify(unique) + ';\n';
fs.mkdirSync(path.dirname(OUT_LABELS), { recursive: true });
fs.writeFileSync(OUT_LABELS, js, 'utf8');

const tiers = unique.reduce((m, l) => (m[l.t] = (m[l.t] || 0) + 1, m), {});
console.log(`几何：水体 ${water.length}、公园 ${parks.length}、道路 ${Object.values(roads).reduce((a, r) => a + r.length, 0)}`);
console.log('标签：' + JSON.stringify(tiers));
console.log(`SVG ${(parts.join('\n').length / 1024).toFixed(0)} KB，标签 ${unique.length} 条`);
