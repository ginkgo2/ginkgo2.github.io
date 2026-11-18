/* 选点器：与正式地图同一套 MapLibre 样式，点击拿 x/y。
   地图库按需加载，评估页初次打开不会拉 1.6MB。 */
(function () {
  'use strict';

  // classic script 里 import() 的相对路径以脚本自身为基准，所以用脚本地址拼绝对路径
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;

  window.SFPicker = function (host, opts) {
    opts = opts || {};
    var onPick = opts.onPick || function () {};
    var value = null;
    var map = null;
    var marker = null;
    var st = null;

    host.classList.add('picker');
    host.innerHTML = '<p class="hint" style="padding:14px;margin:0">正在加载地图…</p>';

    function applyValue() {
      if (!map || !st) return;
      if (value) {
        if (!marker) {
          var el = document.createElement('div');
          el.className = 'pk-marker';
          marker = new map.__ml.Marker({ element: el, anchor: 'center' });
        }
        marker.setLngLat(st.toLngLat(value.x, value.y)).addTo(map);
      } else if (marker) {
        marker.remove();
      }
    }

    (async function () {
      var v = window.SF_VERSION ? '?v=' + encodeURIComponent(window.SF_VERSION) : '';
      var mlUrl = new URL('../vendor/maplibre/maplibre-gl.mjs', SCRIPT_SRC).href + v;
      var stUrl = new URL('map-style.mjs', SCRIPT_SRC).href + v;
      var ml = await import(mlUrl);
      st = await import(stUrl);

      host.innerHTML = '';
      map = new ml.Map({
        container: host,
        style: st.emptyStyle(),
        bounds: st.BOUNDS,
        fitBoundsOptions: { padding: 8 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false
      });
      map.__ml = ml;
      host.__map = map;

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', async function () {
        var fitZoom = map.getZoom();
        var base = await st.loadBase();
        st.addBaseLayers(map, fitZoom, base);

        var detailAdded = false;
        var detailLoading = false;
        async function ensureDetail() {
          if (detailAdded || detailLoading) return;
          detailLoading = true;
          try {
            var detail = await st.loadDetail();
            st.addDetailLayers(map, map.getZoom(), detail);
            detailAdded = true;
          } finally {
            detailLoading = false;
          }
        }
        map.on('zoom', function () {
          if (!detailAdded && map.getZoom() >= fitZoom + 1.2) ensureDetail();
        });

        // 名称叠层：跟地图投影走，做简单避让
        var labelLayer = document.createElement('div');
        labelLayer.className = 'pk-label-layer';
        host.appendChild(labelLayer);

        var allLabels = (window.SF_LABELS || []).concat(window.SF_LABELS_DETAIL || []);
        var labelNodes = allLabels.map(function (l) {
          var el = document.createElement('span');
          el.className = 'pk-label t' + l.t;
          el.textContent = l.n;
          el.style.display = 'none';
          labelLayer.appendChild(el);
          return { el: el, ll: st.toLngLat(l.x, l.y), t: l.t };
        });

        function pkTiers(s) {
          if (s < 2) return [1];
          if (s < 4) return [2];
          if (s < 8) return [2, 3];
          return [2, 3, 4];
        }

        var lraf = 0;
        function renderPkLabels() {
          lraf = 0;
          var size = map.getCanvas().getBoundingClientRect();
          var s = Math.pow(2, map.getZoom() - fitZoom);
          var want = pkTiers(s);
          var placed = [];

          for (var i = 0; i < labelNodes.length; i++) {
            var n = labelNodes[i];
            if (want.indexOf(n.t) < 0) { n.el.style.display = 'none'; continue; }
            if (placed.length >= 40) { n.el.style.display = 'none'; continue; }

            var pt = map.project(n.ll);
            if (pt.x < -60 || pt.x > size.width + 60 || pt.y < -20 || pt.y > size.height + 20) {
              n.el.style.display = 'none';
              continue;
            }

            var w = n.el.textContent.length * 11;
            var h = 13;
            var box = { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: pt.y - h / 2, y2: pt.y + h / 2 };
            var hit = false;
            for (var j = 0; j < placed.length; j++) {
              var b = placed[j];
              if (box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1) { hit = true; break; }
            }
            if (hit) { n.el.style.display = 'none'; continue; }

            placed.push(box);
            n.el.style.display = '';
            n.el.style.left = pt.x + 'px';
            n.el.style.top = pt.y + 'px';
          }
        }
        function schedulePkLabels() {
          if (lraf) return;
          lraf = setTimeout(function () { lraf = 0; renderPkLabels(); }, 16);
        }
        map.on('move', schedulePkLabels);
        map.on('zoom', schedulePkLabels);
        map.on('resize', schedulePkLabels);
        map.on('moveend', renderPkLabels);
        map.on('zoomend', renderPkLabels);
        map.on('idle', schedulePkLabels);
        renderPkLabels();
        // 容器刚显示时尺寸可能还没稳定，多补几次重排
        [0, 120, 400, 1000, 2000].forEach(function (d) {
          setTimeout(function () { map.resize(); renderPkLabels(); }, d);
        });
        applyValue();

        map.on('click', function (e) {
          var xy = st.toXY(e.lngLat.lng, e.lngLat.lat);
          value = { x: Math.round(xy[0]), y: Math.round(xy[1]) };
          applyValue();
          onPick(value.x, value.y);
        });
      });
    })().catch(function () {
      host.innerHTML = '<p class="hint" style="padding:14px;margin:0">地图加载失败，可以在下面直接填坐标。</p>';
    });

    return {
      setValue: function (x, y) {
        value = { x: x, y: y };
        applyValue();
      },
      clear: function () {
        value = null;
        applyValue();
      }
    };
  };
})();
