// OSM 原始数据 → GeoJSON（给 MapLibre 试验页用）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');

const RAW = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'osm_raw_new.json'), 'utf8'));
const POI = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'osm_poi_new.json'), 'utf8'));
const DET = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'osm_detail.json'), 'utf8'));

const round = n => Math.round(n * 1e5) / 1e5;

function line(geom) {
  return geom.map(g => [round(g.lon), round(g.lat)]);
}
function ring(geom) {
  const pts = geom.map(g => [round(g.lon), round(g.lat)]);
  const a = pts[0], b = pts[pts.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) pts.push(a);
  return pts;
}

const base = [];
const detail = [];

for (const el of RAW.elements) {
  const t = el.tags || {};
  if (el.type === 'way' && el.geometry) {
    if (t.natural === 'water') base.push({ type: 'Feature', properties: { kind: 'water' }, geometry: { type: 'Polygon', coordinates: [ring(el.geometry)] } });
    else if (t.leisure === 'park') base.push({ type: 'Feature', properties: { kind: 'park' }, geometry: { type: 'Polygon', coordinates: [ring(el.geometry)] } });
    else if (t.highway) base.push({ type: 'Feature', properties: { kind: 'road', cls: t.highway, name: t.name || '' }, geometry: { type: 'LineString', coordinates: line(el.geometry) } });
    continue;
  }
  if (el.type === 'node' && t.place && t.name) {
    base.push({ type: 'Feature', properties: { kind: 'place', name: t.name, ptype: t.place }, geometry: { type: 'Point', coordinates: [round(el.lon), round(el.lat)] } });
  }
}

for (const el of DET.elements) {
  const t = el.tags || {};
  if (el.type === 'node') {
    if (t.barrier === 'gate' || t.amenity === 'parking_entrance') {
      detail.push({ type: 'Feature', properties: { kind: 'gate', name: t.name || '' }, geometry: { type: 'Point', coordinates: [round(el.lon), round(el.lat)] } });
    }
    continue;
  }
  if (el.type !== 'way' || !el.geometry) continue;
  if (t.building) {
    const pts = el.geometry.map(g => [g.lon, g.lat]);
    // 粗略面积（平方米），用于按大小分档显示
    let area = 0;
    const lat0 = pts[0][1];
    const kx = Math.cos(lat0 * Math.PI / 180) * 111320;
    const ky = 110540;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += (pts[j][0] * kx) * (pts[i][1] * ky) - (pts[i][0] * kx) * (pts[j][1] * ky);
    }
    area = Math.abs(area / 2);

    detail.push({
      type: 'Feature',
      properties: { kind: 'building', a: Math.round(area) },
      geometry: { type: 'Polygon', coordinates: [ring(el.geometry)] }
    });
  } else if (t.highway) {
    detail.push({ type: 'Feature', properties: { kind: 'minor', cls: t.highway }, geometry: { type: 'LineString', coordinates: line(el.geometry) } });
  }
}

const write = (name, feats) => {
  const gj = { type: 'FeatureCollection', features: feats };
  const out = path.join(SITE, 'data', name);
  fs.writeFileSync(out, JSON.stringify(gj), 'utf8');
  console.log(name, feats.length, '个要素', (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
};

// 底图拆成面要素与道路两块，前端并行拉取
write('map-base-area.geojson', base.filter(f => f.properties.kind !== 'road'));
write('map-base-road.geojson', base.filter(f => f.properties.kind === 'road'));

// 细节层：建筑按经度四分，小路和门单独一块
const bld = detail.filter(f => f.properties.kind === 'building');
const other = detail.filter(f => f.properties.kind !== 'building');
const lons = bld.map(f => f.geometry.coordinates[0][0][0]);
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);
const step = (maxLon - minLon) / 4;
const quads = [[], [], [], []];
for (const f of bld) {
  const lon = f.geometry.coordinates[0][0][0];
  quads[Math.min(3, Math.max(0, Math.floor((lon - minLon) / step)))].push(f);
}
quads.forEach((q, i) => write('map-detail-b' + (i + 1) + '.geojson', q));
write('map-detail-other.geojson', other);
