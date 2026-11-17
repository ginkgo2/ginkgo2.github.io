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

const LAT0 = (BBOX.s + BBOX.n) / 2;

// 比例尺显示某个米数时对应的缩放级别（MapLibre 比例尺按 1 米/像素 ≈ 100 米）
export function zoomForMetersPerPixel(mpp) {
  return Math.log2(156543.03392 * Math.cos(LAT0 * Math.PI / 180) / mpp);
}

export function emptyStyle() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f7f5f1' } }]
  };
}

export async function loadData() {
  const [base, detail] = await Promise.all([
    fetch('./data/map-base.geojson').then(r => r.json()),
    fetch('./data/map-detail.geojson').then(r => r.json())
  ]);
  return { base, detail };
}

// 加入所有图层。z0 为初始适配缩放，建筑按面积分档
export function addLayers(map, z0, data) {
  map.addSource('base', { type: 'geojson', data: data.base });
  map.addSource('detail', { type: 'geojson', data: data.detail });

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

  // 建筑：按比例尺分档出现，颜色随比例尺由浅变深（300 米时最浅，100 米时恢复正常）
  const zBldBig = zoomForMetersPerPixel(3);    // 比例尺约 300 米
  const zBldMid = zoomForMetersPerPixel(1.6);  // 约 160 米
  const zBldSmall = zoomForMetersPerPixel(1);  // 约 100 米
  const zDark = zBldSmall;

  const bPaint = {
    'fill-color': ['interpolate', ['linear'], ['zoom'], zBldBig, '#f1ede6', zDark, '#e2ddcf'],
    'fill-outline-color': ['interpolate', ['linear'], ['zoom'], zBldBig, '#e9e4dc', zDark, '#d2cbbb']
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
