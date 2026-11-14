#!/usr/bin/env node
/* 合并脚本：地点表 + 观察导出 → 公开点位数据
 *
 * 用法：
 *   node scripts/merge.mjs --places ../data/places.csv --raw ../raw --out data/points.js
 *
 * 定级直接复用 assets/js/core.js 里的 SF.level，规则只有一份。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');

/* ---------- 参数 ---------- */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    out[key] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const placesFile = args.places;
const rawDir = args.raw;
const outFile = args.out || path.join(SITE, 'data', 'points.js');
const internalFile = args.internal || null;

if (!placesFile || !rawDir) {
  console.error('用法: node scripts/merge.mjs --places <places.csv> --raw <raw目录> [--out data/points.js] [--internal internal.json]');
  process.exit(1);
}

/* ---------- 读量表 ---------- */

const sandbox = {
  window: {},
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { getAttribute() { return null; } }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(SITE, 'assets/js/core.js'), 'utf8'), sandbox);
const SF = sandbox.window.SF;

const DIM_IDS = SF.DIMS.map(d => d.id);
const DIM_NAME = Object.fromEntries(SF.DIMS.map(d => [d.id, d.name]));
const ENV_IDS = SF.ENV_TYPES.map(t => t.id);
const PUBLIC_LEVELS = ['recommended', 'conditional'];

/* ---------- 工具 ---------- */

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v.trim() !== '')) rows.push(row); }

  const head = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function walkJson(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) out.push(...walkJson(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/* ---------- 地点表 ---------- */

const places = readCsv(placesFile).map((r, i) => {
  const line = i + 2;
  if (!r.id) err(`places.csv 第 ${line} 行没有 id`);
  if (!r.name) err(`places.csv 第 ${line} 行（${r.id}）没有 name`);
  if (!ENV_IDS.includes(r.envType)) err(`places.csv 第 ${line} 行（${r.id}）envType 无效：${r.envType}`);
  return {
    id: r.id,
    name: r.name,
    envType: r.envType,
    x: r.x === '' ? null : Number(r.x),
    y: r.y === '' ? null : Number(r.y),
    status: r.status || 'candidate'
  };
});

const placeById = new Map();
for (const p of places) {
  if (placeById.has(p.id)) err(`places.csv 里 id 重复：${p.id}`);
  placeById.set(p.id, p);
}

/* ---------- 观察记录 ---------- */

const observations = [];
for (const file of walkJson(rawDir)) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(`${path.basename(file)} 不是合法 JSON：${e.message}`);
    continue;
  }
  const list = Array.isArray(data) ? data : [data];
  for (const o of list) observations.push({ ...o, __file: path.basename(file) });
}

if (!observations.length) warn('raw 目录里没有观察记录');

for (const o of observations) {
  const tag = `${o.id || '?'}（${o.__file}）`;
  if (!o.id) { err(`${tag} 缺 id`); continue; }
  if (!placeById.has(o.id)) err(`${tag} 在 places.csv 里找不到对应点位`);
  if (!o.observedAt || isNaN(Date.parse(o.observedAt))) err(`${tag} observedAt 不是合法时间`);
  if (!o.rater) warn(`${tag} 没有填评估人，一致率无法配对`);

  const scores = o.scores || {};
  for (const key of Object.keys(scores)) {
    if (!DIM_IDS.includes(key)) err(`${tag} 出现未知条目：${key}`);
    const v = scores[key];
    if (v != null && (v < 1 || v > 5 || !Number.isInteger(v))) err(`${tag} ${key} 分值越界：${v}`);
  }

  const recomputed = SF.level(scores).key;
  if (o.level && o.level !== recomputed) {
    warn(`${tag} 导出等级 ${o.level} 与重算 ${recomputed} 不一致，以重算为准`);
  }
  o.__level = recomputed;
}

/* ---------- 一致率 ---------- */

function agreement(list) {
  const a = list[0].scores || {};
  const b = list[1].scores || {};
  let compared = 0, exact = 0, within1 = 0;
  const detail = [];
  for (const id of DIM_IDS) {
    if (a[id] == null || b[id] == null) continue;
    compared++;
    const diff = Math.abs(a[id] - b[id]);
    if (diff === 0) exact++;
    if (diff <= 1) within1++;
    if (diff > 0) detail.push(`${DIM_NAME[id]} ${a[id]}/${b[id]}`);
  }
  return { compared, exact, within1, detail };
}

const byPoint = new Map();
for (const o of observations) {
  if (!byPoint.has(o.id)) byPoint.set(o.id, []);
  byPoint.get(o.id).push(o);
}

const consistency = [];
for (const [id, list] of byPoint) {
  if (list.length < 2) continue;
  const pair = list.filter(o => o.__level).slice(0, 2);
  if (pair.length < 2) continue;
  const r = agreement(pair);
  consistency.push({
    id,
    raters: pair.map(o => o.rater || '?'),
    ...r,
    exactRate: r.compared ? +(r.exact / r.compared).toFixed(3) : null,
    within1Rate: r.compared ? +(r.within1 / r.compared).toFixed(3) : null
  });
}

/* ---------- 生成公开点位 ---------- */

function pickPrimary(list) {
  return list.slice().sort((a, b) => {
    const fa = Object.values(a.scores || {}).filter(v => v != null).length;
    const fb = Object.values(b.scores || {}).filter(v => v != null).length;
    if (fa !== fb) return fb - fa;
    return Date.parse(b.observedAt) - Date.parse(a.observedAt);
  })[0];
}

const publicPoints = [];
const internal = [];
const skipped = [];

for (const place of places) {
  const list = (byPoint.get(place.id) || []).filter(o => o.__level);
  if (!list.length) { skipped.push([place.id, '没有观察记录']); continue; }

  const levels = [...new Set(list.map(o => o.__level))];
  if (list.length >= 2 && levels.length > 1) {
    warn(`${place.id} 两位评估人给出的等级不一致（${levels.join(' / ')}），复核后再发布`);
    skipped.push([place.id, '等级不一致']);
    continue;
  }

  const primary = pickPrimary(list);
  const level = primary.__level;

  if (place.status !== 'verified') { skipped.push([place.id, '尚未核验']); continue; }
  if (!PUBLIC_LEVELS.includes(level)) { skipped.push([place.id, '公开版只放推荐和有条件推荐']); continue; }
  if (level === 'conditional' && !primary.note) {
    err(`${place.id} 是有条件推荐，但没有写具体条件`);
    skipped.push([place.id, '缺条件']);
    continue;
  }
  if (place.x == null || place.y == null) warn(`${place.id} 没有坐标，地图上不会出现`);

  publicPoints.push({
    id: place.id,
    name: place.name,
    envType: place.envType,
    x: place.x,
    y: place.y,
    observedAt: primary.observedAt,
    level,
    note: primary.note || '',
    status: 'verified'
  });

  internal.push({ place, observations: list, primary });
}

/* ---------- 输出 ---------- */

publicPoints.sort((a, b) => a.id.localeCompare(b.id));

const js = '/* 由 scripts/merge.mjs 生成，不要手改。 */\n' +
  'window.SF_POINTS = ' + JSON.stringify(publicPoints, null, 2) + ';\n';
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, js, 'utf8');

if (internalFile) {
  fs.writeFileSync(internalFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    places,
    observations,
    consistency,
    publicIds: publicPoints.map(p => p.id)
  }, null, 2), 'utf8');
}

/* ---------- 报告 ---------- */

console.log(`地点 ${places.length} 个，观察 ${observations.length} 条，公开点位 ${publicPoints.length} 个`);
if (publicPoints.length) {
  console.log('\n公开点位：');
  for (const p of publicPoints) console.log(`  ${p.id}  ${p.level.padEnd(15)} ${p.name}`);
}
if (skipped.length) {
  console.log('\n没进公开版的点位：');
  for (const [id, why] of skipped) console.log(`  ${id}  ${why}`);
}
if (consistency.length) {
  console.log('\n双人一致率：');
  for (const c of consistency) {
    console.log(`  ${c.id}  ${c.raters.join('/')}  完全一致 ${c.exact}/${c.compared}（${(c.exactRate * 100).toFixed(0)}%），±1 一致 ${(c.within1Rate * 100).toFixed(0)}%${c.detail.length ? '　分歧：' + c.detail.join('、') : ''}`);
  }
}
if (warnings.length) {
  console.log('\n提醒：');
  warnings.forEach(w => console.log('  · ' + w));
}
if (errors.length) {
  console.log('\n错误：');
  errors.forEach(e => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('\n已写入 ' + path.relative(process.cwd(), outFile));
