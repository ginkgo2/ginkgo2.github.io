// 拉取底图数据（道路、水体、公园、地名 + POI），保存到系统临时目录
// 用法: node scripts/fetch-map-data.mjs
// 依赖 map-config.mjs 里的 BBOX；换城市只改那一处
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BBOX } from './map-config.mjs';

const UA = 'sensory-friendly-map/0.1 (student project; contact: 3548261366@qq.com)';
const headers = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': 'application/json',
  'User-Agent': UA
};

const B = [BBOX.s, BBOX.w, BBOX.n, BBOX.e].join(',');

const QUERIES = [
  {
    name: 'osm_raw.json',
    label: '道路水利地名',
    q: `[out:json][timeout:240];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${B});
  way["natural"="water"](${B});
  way["leisure"="park"](${B});
  node["place"~"^(suburb|neighbourhood|town|village)$"](${B});
);
out geom;`
  },
  {
    name: 'osm_poi.json',
    label: 'POI',
    q: `[out:json][timeout:240];
(
  nwr["amenity"~"^(hospital|clinic|school|university|college|marketplace|bus_station|townhall|theatre|cinema)$"](${B});
  nwr["shop"="mall"](${B});
  nwr["railway"="station"](${B});
  nwr["tourism"~"^(museum|attraction|zoo)$"](${B});
  nwr["leisure"~"^(park|sports_centre)$"]["name"](${B});
);
out center;`
  }
];

const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

async function fetchOne(q) {
  for (let round = 0; round < 3; round++) {
    for (const ep of EPS) {
      try {
        const t = Date.now();
        const r = await fetch(ep, {
          method: 'POST',
          headers,
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(300000)
        });
        const txt = await r.text();
        console.log('  ', ep, r.status, Date.now() - t + 'ms', (txt.length / 1024).toFixed(0) + 'KB');
        if (!r.ok || !txt.trim().startsWith('{')) continue;
        return JSON.parse(txt);
      } catch (e) {
        console.log('  ', ep, 'ERR', e.message);
      }
      await new Promise(x => setTimeout(x, 3000));
    }
    await new Promise(x => setTimeout(x, 6000 * (round + 1)));
  }
  return null;
}

for (const item of QUERIES) {
  console.log(item.label);
  const j = await fetchOne(item.q);
  if (!j) {
    console.error('失败：' + item.label);
    process.exit(1);
  }
  const out = path.join(os.tmpdir(), item.name);
  fs.writeFileSync(out, JSON.stringify(j));
  console.log('  保存', out, '元素', j.elements.length);
}

console.log('\n完成。接着运行：node scripts/build-map.mjs && node scripts/build-detail.mjs && node scripts/build-geojson.mjs');
