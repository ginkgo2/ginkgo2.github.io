// 生成细节层：小路 + 建筑 + 门（透明背景，叠在底图上）
// 用法: node scripts/build-detail.mjs [detail.json]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { W, H, proj } from './map-config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');

const SRC = process.argv[2] || path.join(os.tmpdir(), 'osm_detail.json');
const OUT_SVG = path.join(SITE, 'assets/img/haigang-detail.svg');
const OUT_LABELS = path.join(SITE, 'data/labels-detail.js');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const MINOR = new Set(['service', 'footway', 'pedestrian', 'path', 'track', 'living_street', 'steps', 'cycleway']);

const buildings = [];
const roads = [];
const gates = [];
const labels = [];

function toPath(geom) {
  if (!geom || geom.length < 2) return null;
  let d = '';
  for (let i = 0; i < geom.length; i++) {
    const p = proj(geom[i].lat, geom[i].lon);
    d += (i ? 'L' : 'M') + p[0] + ' ' + p[1];
  }
  const first = proj(geom[0].lat, geom[0].lon);
  const last = proj(geom[geom.length - 1].lat, geom[geom.length - 1].lon);
  if (first[0] === last[0] && first[1] === last[1]) d += 'Z';
  return d;
}

function center(geom) {
  const pts = geom.map(g => proj(g.lat, g.lon));
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [+(x / pts.length).toFixed(1), +(y / pts.length).toFixed(1)];
}

for (const el of data.elements) {
  const t = el.tags || {};

  if (el.type === 'node') {
    if (t.barrier === 'gate' || t.amenity === 'parking_entrance') {
      const p = proj(el.lat, el.lon);
      gates.push(p);
      if (t.name) labels.push({ n: t.name, x: p[0], y: p[1], t: 3, k: 'gate', r: 11 });
    }
    continue;
  }

  if (el.type !== 'way' || !el.geometry) continue;

  if (t.building) {
    const d = toPath(el.geometry);
    if (d) buildings.push(d);
    if (t.name) {
      const c = center(el.geometry);
      labels.push({ n: t.name, x: c[0], y: c[1], t: 3, k: 'building', r: 13 });
    }
    continue;
  }

  if (t.highway && MINOR.has(t.highway)) {
    const d = toPath(el.geometry);
    if (d) roads.push(d);
  }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const parts = [];
parts.push('<?xml version="1.0" encoding="UTF-8"?>');
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
parts.push('<title>细节层：小路、建筑、门</title>');

if (buildings.length) {
  parts.push('<g fill="#e2ddcf">' + buildings.map(d => `<path d="${d}"/>`).join('') + '</g>');
}

if (roads.length) {
  parts.push('<g fill="none" stroke="#d8d2c4" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    roads.map(d => `<path d="${d}"/>`).join('') + '</g>');
  parts.push('<g fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' +
    roads.map(d => `<path d="${d}"/>`).join('') + '</g>');
}

if (gates.length) {
  parts.push('<g fill="#a03b2f" stroke="#ffffff" stroke-width="1">' +
    gates.map(([x, y]) => `<rect x="${(x - 2.6).toFixed(1)}" y="${(y - 2.6).toFixed(1)}" width="5.2" height="5.2" rx="1"/>`).join('') +
    '</g>');
}

parts.push('</svg>');

fs.mkdirSync(path.dirname(OUT_SVG), { recursive: true });
fs.writeFileSync(OUT_SVG, parts.join('\n'), 'utf8');

const js = '/* 细节层标签，由 scripts/build-detail.mjs 生成 */\n' +
  'window.SF_LABELS_DETAIL = ' + JSON.stringify(labels) + ';\n';
fs.writeFileSync(OUT_LABELS, js, 'utf8');

console.log(`建筑 ${buildings.length}，小路 ${roads.length}，门 ${gates.length}，细节标签 ${labels.length}`);
console.log(`SVG ${(parts.join('\n').length / 1024).toFixed(0)} KB`);
