/* 选点器：在评估页里点一下地图，拿到 x/y。
   用了海港区底图，坐标系与 places.csv 一致（1000×620）。 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var W = 1000, H = 620;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  window.SFPicker = function (host, opts) {
    opts = opts || {};
    var s = 1.6;
    var cx = W / 2, cy = H / 2;
    var onPick = opts.onPick || function () {};
    var value = null;

    host.classList.add('picker');
    host.innerHTML = '';

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 620');
    svg.setAttribute('role', 'application');
    svg.setAttribute('aria-label', '在地图上选择位置，点击放置标记');
    svg.innerHTML =
      '<image href="./assets/img/haigang.svg" x="0" y="0" width="1000" height="620"></image>' +
      '<g class="pk-marks"></g>' +
      '<circle class="pk-dot" cx="-99" cy="-99" r="0" fill="none" stroke="#9c3b30"></circle>';
    host.appendChild(svg);

    var tools = document.createElement('div');
    tools.className = 'map-tools';
    tools.innerHTML =
      '<button type="button" data-z="in" aria-label="放大">＋</button>' +
      '<button type="button" data-z="out" aria-label="缩小">－</button>' +
      '<button type="button" data-z="reset">复位</button>';
    host.appendChild(tools);

    var dot = svg.querySelector('.pk-dot');
    var marks = svg.querySelector('.pk-marks');

    function apply() {
      var vw = W / s, vh = H / s;
      var x = clamp(cx - vw / 2, 0, W - vw);
      var y = clamp(cy - vh / 2, 0, H - vh);
      cx = x + vw / 2;
      cy = y + vh / 2;
      svg.setAttribute('viewBox', [x, y, vw, vh].join(' '));
      drawMarks();
      if (value) place(value.x, value.y);
    }

    function drawMarks() {
      var k = 1 / s;
      marks.innerHTML = '';
      (window.SF_LANDMARKS || []).forEach(function (m) {
        if (!isFinite(Number(m.x)) || !isFinite(Number(m.y))) return;
        var t = document.createElementNS(NS, 'text');
        t.setAttribute('x', m.x);
        t.setAttribute('y', m.y);
        t.setAttribute('font-size', 10 * k);
        t.setAttribute('fill', 'var(--muted)');
        t.setAttribute('stroke', 'var(--surface)');
        t.setAttribute('stroke-width', 2.5 * k);
        t.setAttribute('stroke-linejoin', 'round');
        t.setAttribute('paint-order', 'stroke');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('pointer-events', 'none');
        t.textContent = m.name;
        marks.appendChild(t);
      });
    }

    function place(x, y) {
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 9 / s);
      dot.setAttribute('stroke-width', 2 / s);
    }

    function toMap(e) {
      var pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    function zoomAt(factor) {
      s = clamp(s * factor, 1, 6);
      apply();
    }

    var drag = null;
    var moved = false;

    svg.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, cx: cx, cy: cy };
      moved = false;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('is-dragging');
    });

    svg.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      var r = svg.getBoundingClientRect();
      var vw = W / s, vh = H / s;
      cx = drag.cx - dx * (vw / r.width);
      cy = drag.cy - dy * (vh / r.height);
      apply();
    });

    function endDrag() {
      drag = null;
      svg.classList.remove('is-dragging');
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    svg.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      var m = toMap(e);
      var x = Math.round(clamp(m.x, 0, W));
      var y = Math.round(clamp(m.y, 0, H));
      value = { x: x, y: y };
      place(x, y);
      onPick(x, y);
    });

    tools.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var z = btn.getAttribute('data-z');
      if (z === 'in') zoomAt(1.4);
      else if (z === 'out') zoomAt(1 / 1.4);
      else { s = 1.6; cx = W / 2; cy = H / 2; apply(); }
    });

    apply();

    return {
      setValue: function (x, y) {
        value = { x: x, y: y };
        apply();
      },
      clear: function () {
        value = null;
        dot.setAttribute('r', 0);
      }
    };
  };
})();
