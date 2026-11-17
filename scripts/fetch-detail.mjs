// 拉取细节层几何：小路、建筑、门
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
const q = `[out:json][timeout:240];
(
  way["highway"~"^(service|footway|pedestrian|path|track|living_street|steps|cycleway)$"](${B});
  way["building"](${B});
  node["barrier"="gate"](${B});
  node["amenity"="parking_entrance"](${B});
  nwr["name"]["building"](${B});
);
out geom;`;

const eps = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

for (let round = 0; round < 4; round++) {
  for (const ep of eps) {
    try {
      const t = Date.now();
      const r = await fetch(ep, {
        method: 'POST',
        headers,
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(300000)
      });
      const txt = await r.text();
      console.log(ep, r.status, Date.now() - t + 'ms', (txt.length / 1024).toFixed(0) + 'KB');
      if (!r.ok || !txt.trim().startsWith('{')) continue;

      const j = JSON.parse(txt);
      const out = path.join(os.tmpdir(), 'osm_detail.json');
      fs.writeFileSync(out, JSON.stringify(j));
      console.log('保存', out, '元素', j.elements.length);
      process.exit(0);
    } catch (e) {
      console.log(ep, 'ERR', e.message);
    }
    await new Promise(x => setTimeout(x, 3000));
  }
  console.log('第 ' + (round + 1) + ' 轮失败，等待');
  await new Promise(x => setTimeout(x, 8000 * (round + 1)));
}

console.log('全部失败');
process.exit(1);
