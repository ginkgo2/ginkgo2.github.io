/* 感官友好 · 共享配置与页面骨架
   经典脚本（非 module），file:// 下也能跑。 */
(function () {
  'use strict';

  /* ---------- 量表 ---------- */

  var DIMS = [
    {
      id: 'noise', name: '噪声', hint: '30 秒指示值只作参考，判定看能不能交谈',
      anchors: {
        5: '正常交谈，不用提高音量（≤50 dB 参考）',
        4: '偶尔需侧耳（51—55 dB 参考）',
        3: '需提高音量（56—60 dB 参考）',
        2: '需凑近说（61—70 dB 参考）',
        1: '必须喊话（>70 dB 参考）'
      }
    },
    {
      id: 'surprise', name: '突发声', hint: '三个 10 分钟窗各记一次，按最差的一窗定分',
      anchors: {
        5: '每个窗 0—1 次',
        4: '每个窗 2 次',
        3: '每个窗 3—5 次',
        2: '每个窗 6 次以上，但时间固定、可提前避开',
        1: '每个窗 6 次以上且不可预料，或有 1 次全场惊跳'
      }
    },
    {
      id: 'light', name: '光环境与视觉杂乱', hint: '看灯具、慢动作看频闪、数高饱和块面',
      anchors: {
        5: '自然光或柔和间接光，无可见频闪，视野干净',
        4: '局部偏亮或少量高饱和装饰，无频闪',
        3: '荧光灯直射或局部眩光，或中等密度海报导视',
        2: '荧光灯直射 + 眩光，或可见频闪，或大面积高饱和、镜面、反光地面',
        1: '强眩光 + 可见频闪 + 密集视觉噪声，或闪烁屏正对停留区'
      }
    },
    {
      id: 'crowd', name: '人流拥挤', hint: '5 分钟过人数 + 排队时长 + 同时停留人数',
      anchors: {
        5: '少于 10 人/5 分钟，可保持 1.5 m',
        4: '10—25 人，偶需侧身',
        3: '26—45 人，需侧身；或排队 3 分钟以内',
        2: '46—60 人；或排队超过 3 分钟、不超过 10 分钟；或同时停留 15 人以上',
        1: '超过 60 人；或持续拥挤；或排队超过 10 分钟'
      }
    },
    {
      id: 'quiet', name: '安静空间', hint: '最近能坐、能关门、比较安静的地方，记步行时间',
      anchors: {
        5: '≤3 分钟可达，可坐可关门，有标识',
        4: '3—5 分钟可达，可坐，比较安静',
        3: '5—10 分钟可达；或 3—5 分钟但需消费、需询问、无标识',
        2: '10 分钟以上；或虽有但不能坐、噪声高',
        1: '没有可用恢复空间'
      }
    },
    {
      id: 'smell', name: '气味', hint: '站位 2 分钟，记来源',
      anchors: {
        5: '无明显气味',
        4: '极轻微，注意才察觉',
        3: '明显但可忍受',
        2: '明显且持续，想离开',
        1: '强烈刺激，无法停留'
      }
    }
  ];

  var ENV_TYPES = [
    { id: 'path', name: '通行路径' },
    { id: 'daily', name: '日常必需' },
    { id: 'public', name: '公共空间' },
    { id: 'venue', name: '大型场馆' }
  ];

  var SCENARIOS = [
    { id: 'indoor', name: '城市室内' },
    { id: 'outdoor', name: '城市室外' },
    { id: 'nature', name: '自然户外' }
  ];

  var LEVELS = {
    recommended: { label: '推荐', cls: 'ok', glyph: '●', text: '六项都在 4 分以上' },
    conditional: { label: '有条件推荐', cls: 'warn', glyph: '▲', text: '最低的一项是 3 分，要把条件写出来' },
    not_recommended: { label: '不推荐', cls: 'bad', glyph: '■', text: '有项目在 2 分或以下' },
    no_data: { label: '暂无数据', cls: 'none', glyph: '○', text: '缺两项以上，不建议下结论' }
  };

  /* ---------- 定级 ----------
     先判缺失，再判分数：
     缺 ≥2 → 暂无数据；任一 ≤2 → 不推荐；缺 1 → 有条件推荐（补测前不给推荐）；
     六项齐全且全部 ≥4 → 推荐；其余（最低 = 3）→ 有条件推荐 */

  function level(scores) {
    var values = [];
    var missing = [];
    DIMS.forEach(function (d) {
      var v = scores[d.id];
      if (v === null || v === undefined || v === '') missing.push(d.name);
      else values.push(Number(v));
    });

    var key, text;
    if (values.length <= DIMS.length - 2) {
      key = 'no_data';
      text = '缺两项以上，不建议下结论';
    } else if (values.some(function (v) { return v <= 2; })) {
      key = 'not_recommended';
      text = '有项目在 2 分或以下';
    } else if (missing.length) {
      key = 'conditional';
      text = '缺一项，补测前只能按有条件推荐';
    } else if (values.every(function (v) { return v >= 4; })) {
      key = 'recommended';
      text = '六项都在 4 分以上';
    } else {
      key = 'conditional';
      text = '最低的一项是 3 分，要把条件写出来';
    }

    var lv = LEVELS[key];
    return {
      key: key,
      label: lv.label,
      cls: lv.cls,
      glyph: lv.glyph,
      text: text,
      missing: missing,
      partial: missing.length === 1
    };
  }

  /* ---------- 小工具 ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function nowLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : String(iso);
  }

  function badge(lv) {
    return '<span class="badge badge-' + lv.cls + '"><span class="glyph" aria-hidden="true">' +
      lv.glyph + '</span>' + esc(lv.label) + '</span>';
  }

  /* 六项分条：只标唯一最弱项，不给平均分 */
  function scoreBars(scores) {
    scores = scores || {};
    var vals = DIMS.map(function (d) {
      var v = scores[d.id];
      return v == null ? null : Number(v);
    }).filter(function (v) { return v != null; });

    var min = vals.length ? Math.min.apply(null, vals) : null;
    var uniqueMin = min != null && vals.filter(function (v) { return v === min; }).length === 1;

    return '<ul class="bars">' + DIMS.map(function (d) {
      var raw = scores[d.id];
      var v = raw == null ? null : Number(raw);
      var cls = v == null ? 'none' : v <= 2 ? 'bad' : v === 3 ? 'warn' : 'ok';
      var weak = uniqueMin && v === min ? ' is-weak' : '';
      var pct = v == null ? 0 : v / 5 * 100;

      return '<li class="bar-row' + weak + '">' +
        '<span class="bar-label">' + esc(d.name) + '</span>' +
        '<span class="bar-track"><span class="bar-fill fill-' + cls + '" style="width:' + pct + '%"></span></span>' +
        '<span class="bar-score">' + (v == null ? '—' : v) + '</span>' +
        '</li>';
    }).join('') + '</ul>';
  }

  function store(key, value) {
    try {
      if (value === undefined) {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return null; }
  }

  function points() {
    return Array.isArray(window.SF_POINTS) ? window.SF_POINTS : [];
  }

  /* ---------- 页脚里的版本戳 ---------- */

  function initBuild() {
    var host = document.getElementById('build');
    if (!host) return;
    var parts = [];
    if (window.SF_VERSION) parts.push(window.SF_VERSION);
    if (window.SF_BUILD) parts.push('更新于 ' + window.SF_BUILD);
    host.textContent = parts.join(' · ');
  }

  /* ---------- 启动 ---------- */

  function boot() {
    initBuild();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.SF = {
    DIMS: DIMS,
    ENV_TYPES: ENV_TYPES,
    SCENARIOS: SCENARIOS,
    LEVELS: LEVELS,
    level: level,
    $: $,
    $$: $$,
    esc: esc,
    nowLocal: nowLocal,
    fmtDate: fmtDate,
    badge: badge,
    scoreBars: scoreBars,
    store: store,
    points: points
  };
})();
