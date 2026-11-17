// 地图公共配置：生成底图和细节层时必须用同一份
export const W = 1000;
export const H = 620;
export const BBOX = { s: 39.878, w: 119.515, n: 39.958, e: 119.683 };
export const DETAIL = { s: 39.908, w: 119.532, n: 39.934, e: 119.565 };

const lat0 = (BBOX.s + BBOX.n) / 2;
const kx = Math.cos((lat0 * Math.PI) / 180);
const dx = (BBOX.e - BBOX.w) * kx;
const dy = BBOX.n - BBOX.s;
export const scale = Math.min(W / dx, H / dy);
export const offX = (W - dx * scale) / 2;
export const offY = (H - dy * scale) / 2;

export function proj(lat, lon) {
  return [
    +(((lon - BBOX.w) * kx * scale) + offX).toFixed(1),
    +(((BBOX.n - lat) * scale) + offY).toFixed(1)
  ];
}
