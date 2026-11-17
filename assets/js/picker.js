/* 选点器：与正式地图同一套 MapLibre 样式，点击拿 x/y。
   地图库按需加载，评估页初次打开不会拉 1.6MB。 */
(function () {
  'use strict';

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
      var ml = await import('./assets/vendor/maplibre/maplibre-gl.mjs');
      st = await import('./assets/js/map-style.mjs?v=202611171744');

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

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', async function () {
        var data = await st.loadData();
        st.addLayers(map, map.getZoom(), data);
        applyValue();

        map.on('click', function (e) {
          var xy = st.toXY(e.lngLat.lng, e.lngLat.lat);
          value = { x: Math.round(xy[0]), y: Math.round(xy[1]) };
          applyValue();
          onPick(value.x, value.y);
        });
      });
    })().catch(function () {
      host.innerHTML = '<p class="hint" style="padding:14px;margin:0">地图加载失败，可以直接填坐标。</p>';
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
