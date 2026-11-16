/* 分级标签层：按缩放显示不同层级的名字，并做简单的避让。
   t=1 区/街道/镇   t=2 路名、水体、公园   t=3 POI */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var STYLE = {
    1: { size: 13, fill: '#3f3f3b', weight: 600 },
    2: { size: 10, fill: '#6b6a64', weight: 400 },
    3: { size: 10, fill: '#3f3f3b', weight: 500 }
  };

  // 每个层级在什么倍率区间出现
  function tiersAt(s) {
    if (s < 1.6) return [1];
    if (s < 2.4) return [2];
    return [2, 3];
  }

  function render(layer, s, labels, vw, vh, ox, oy) {
    layer.innerHTML = '';
    if (!labels || !labels.length) return 0;

    var want = tiersAt(s);
    var list = labels.filter(function (l) { return want.indexOf(l.t) >= 0; })
      .sort(function (a, b) { return (a.t - b.t) || (a.r - b.r); });

    var placed = [];
    var count = 0;

    for (var i = 0; i < list.length; i++) {
      var l = list[i];
      if (l.x < ox - 20 || l.x > ox + vw + 20 || l.y < oy - 20 || l.y > oy + vh + 20) continue;

      var st = STYLE[l.t];
      var fsMap = st.size / s;               // 保持屏幕上字号恒定
      var chars = l.n.length;
      var wMap = chars * fsMap * 0.98;
      var hMap = fsMap * 1.25;
      var rotated = l.a != null;

      // 旋转的标签按包围盒估算
      var bw = rotated ? Math.max(wMap * 0.7, hMap) : wMap;
      var bh = rotated ? Math.max(wMap * 0.35, hMap) : hMap;

      var box = { x1: l.x - bw / 2, x2: l.x + bw / 2, y1: l.y - bh / 2, y2: l.y + bh / 2 };
      var hit = false;
      for (var j = 0; j < placed.length; j++) {
        var p = placed[j];
        if (box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1) { hit = true; break; }
      }
      if (hit) continue;

      placed.push(box);

      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', l.x);
      t.setAttribute('y', l.y);
      t.setAttribute('font-size', fsMap);
      t.setAttribute('font-weight', st.weight);
      t.setAttribute('fill', st.fill);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('paint-order', 'stroke');
      t.setAttribute('stroke', '#f7f5f1');
      t.setAttribute('stroke-width', 2.6 / s);
      t.setAttribute('stroke-linejoin', 'round');
      t.setAttribute('pointer-events', 'none');
      if (rotated) t.setAttribute('transform', 'rotate(' + l.a + ' ' + l.x + ' ' + l.y + ')');
      t.textContent = l.n;
      layer.appendChild(t);
      count++;
    }
    return count;
  }

  window.SFML = { render: render, tiersAt: tiersAt };
})();
