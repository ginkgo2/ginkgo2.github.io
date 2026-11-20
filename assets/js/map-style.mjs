// 地图共享配置：正式地图页和评估页选点器共用
export const BBOX = { s: 39.878, w: 119.515, n: 39.958, e: 119.683 };
export const W = 1000, H = 620;

const lat0 = (BBOX.s + BBOX.n) / 2;
const kx = Math.cos(lat0 * Math.PI / 180);
const dx = (BBOX.e - BBOX.w) * kx;
const dy = BBOX.n - BBOX.s;
const scale = Math.min(W / dx, H / dy);
const offX = (W - dx * scale) / 2;
const offY = (H - dy * scale) / 2;

export function toLngLat(x, y) {
  return [BBOX.w + (x - offX) / (kx * scale), BBOX.n - (y - offY) / scale];
}

export function toXY(lng, lat) {
  return [(lng - BBOX.w) * kx * scale + offX, (BBOX.n - lat) * scale + offY];
}

export const BOUNDS = [[BBOX.w, BBOX.s], [BBOX.e, BBOX.n]];

const R = 6378137;

function haversine(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 用地图自身的投影量出“当前 1 像素多少米”，不依赖瓦片尺寸常数
function metersPerPixel(map) {
  const c = map.getCenter();
  const p = map.project(c);
  const q = map.unproject([p.x + 100, p.y]);
  return haversine(c, q) / 100;
}

// MapLibre 的比例尺按 1/2/3/5 阶梯取整，标签「500 米」会横跨一段缩放区间。
// 这里返回标签「刚变成 meters 米」时的缩放级别（即该档位的上沿）。
function nextNiceAbove(v) {
  const bases = [1, 2, 3, 5, 10];
  const exp = Math.floor(Math.log10(v));
  for (let e = exp; e <= exp + 2; e++) {
    for (const b of bases) {
      const n = b * Math.pow(10, e);
      if (n > v) return n;
    }
  }
  return v * 10;
}

export function zoomForScale(map, meters) {
  const edge = nextNiceAbove(meters);
  return map.getZoom() + Math.log2(metersPerPixel(map) / (edge / 100));
}

export function emptyStyle() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f7f5f1' } }]
  };
}

// 分块并行拉取，再合并成一个 FeatureCollection
async function fetchParts(urls) {
  const parts = await Promise.all(urls.map(u => fetch(u).then(r => r.json())));
  const features = [];
  for (const p of parts) {
    for (const f of p.features) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}

export async function loadBase() {
  const urls = [
    './data/map-base-area.geojson',
    './data/map-base-road.geojson'
  ];

  // 页面 head 里已经先发起了请求，这里直接复用，和库的下载并行
  let parts = null;
  if (typeof window !== 'undefined' && window.__sfBaseParts) {
    try { parts = await Promise.all(window.__sfBaseParts); } catch (e) { parts = null; }
  }
  if (!parts) parts = await Promise.all(urls.map(u => fetch(u).then(r => r.json())));

  const features = [];
  for (const p of parts) {
    for (const f of p.features) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}

// 细节层较大，按需加载，五个分块并行
export async function loadDetail() {
  return fetchParts([
    './data/map-detail-b1.geojson',
    './data/map-detail-b2.geojson',
    './data/map-detail-b3.geojson',
    './data/map-detail-b4.geojson',
    './data/map-detail-other.geojson'
  ]);
}

export function addBaseLayers(map, z0, base) {
  map.addSource('base', { type: 'geojson', data: base });

  map.addLayer({ id: 'water', type: 'fill', source: 'base', filter: ['==', ['get', 'kind'], 'water'], paint: { 'fill-color': '#d5e7f0' } });
  map.addLayer({ id: 'park', type: 'fill', source: 'base', filter: ['==', ['get', 'kind'], 'park'], paint: { 'fill-color': '#dfeada' } });

  const widths = { motorway: 3.8, trunk: 3.3, primary: 2.6, secondary: 1.9, tertiary: 1.3 };
  const colors = { motorway: '#efc469', trunk: '#f3d39a', primary: '#fbe7c2', secondary: '#ffffff', tertiary: '#ffffff' };
  const casings = { motorway: '#dcb877', trunk: '#ddc49a', primary: '#ddd0b6', secondary: '#ded8cc', tertiary: '#e6e1d7' };

  for (const cls of ['tertiary', 'secondary', 'primary', 'trunk', 'motorway']) {
    map.addLayer({
      id: 'road-c-' + cls, type: 'line', source: 'base',
      filter: ['all', ['==', ['get', 'kind'], 'road'], ['==', ['get', 'cls'], cls]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': casings[cls],
        'line-width': ['interpolate', ['linear'], ['zoom'], z0 - 1, widths[cls] + 1.1, z0 + 4, (widths[cls] + 1.1) * 1.9]
      }
    });
    map.addLayer({
      id: 'road-f-' + cls, type: 'line', source: 'base',
      filter: ['all', ['==', ['get', 'kind'], 'road'], ['==', ['get', 'cls'], cls]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors[cls],
        'line-width': ['interpolate', ['linear'], ['zoom'], z0 - 1, widths[cls], z0 + 4, widths[cls] * 1.9]
      }
    });
  }
}

export function addDetailLayers(map, z0, detail) {
  map.addSource('detail', { type: 'geojson', data: detail });

  map.addLayer({
    id: 'minor-casing', type: 'line', source: 'detail', minzoom: z0 + 1.6,
    filter: ['==', ['get', 'kind'], 'minor'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#d8d2c4', 'line-width': ['interpolate', ['linear'], ['zoom'], z0 + 1.4, 1.6, z0 + 5, 3.4] }
  });
  map.addLayer({
    id: 'minor', type: 'line', source: 'detail', minzoom: z0 + 1.6,
    filter: ['==', ['get', 'kind'], 'minor'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], z0 + 1.4, 1.0, z0 + 5, 2.4] }
  });

  const zBldBig = zoomForScale(map, 500);
  const zBldMid = zoomForScale(map, 200);
  const zBldSmall = zoomForScale(map, 100);
  const zDark = zBldSmall;

  const bPaint = {
    'fill-color': ['interpolate', ['linear'], ['zoom'], zBldBig, '#f0ece3', zBldMid, '#eeeadf', zDark, '#e2ddcf'],
    'fill-outline-color': ['interpolate', ['linear'], ['zoom'], zBldBig, '#e6e1d7', zBldMid, '#e4dfd4', zDark, '#d2cbbb']
  };

  map.addLayer({
    id: 'bld-big', type: 'fill', source: 'detail', minzoom: zBldBig,
    filter: ['all', ['==', ['get', 'kind'], 'building'], ['>=', ['get', 'a'], 1500]],
    paint: bPaint
  });
  map.addLayer({
    id: 'bld-mid', type: 'fill', source: 'detail', minzoom: zBldMid,
    filter: ['all', ['==', ['get', 'kind'], 'building'], ['>=', ['get', 'a'], 400], ['<', ['get', 'a'], 1500]],
    paint: bPaint
  });
  map.addLayer({
    id: 'bld-small', type: 'fill', source: 'detail', minzoom: zBldSmall,
    filter: ['all', ['==', ['get', 'kind'], 'building'], ['<', ['get', 'a'], 400]],
    paint: bPaint
  });
  map.addLayer({
    id: 'gate', type: 'circle', source: 'detail', minzoom: z0 + 2.8,
    filter: ['==', ['get', 'kind'], 'gate'],
    paint: {
      'circle-color': '#a03b2f',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], z0 + 2.6, 3, z0 + 5, 6],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1
    }
  });
}
