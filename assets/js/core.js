/* 感官友好 · 共享配置与页面骨架
   经典脚本（非 module），file:// 下也能跑。 */
(function () {
  'use strict';

  /* ---------- 量表 ---------- */

  var DIMS = [
    {
      id: 'noise', name: '噪声', hint: '30 秒指示值 + 能否交谈',
      anchors: {
        5: '≤50 dB，正常交谈',
        4: '51—55 dB，偶尔需侧耳',
        3: '56—60 dB，需提高音量',
        2: '61—70 dB，需凑近说',
        1: '>70 dB，或必须喊话'
      }
    },
    {
      id: 'surprise', name: '突发声', hint: '三个 10 分钟窗，记次数、来源、是否可预料',
      anchors: {
        5: '0—1 次',
        4: '2 次',
        3: '3—5 次',
        2: '≥6 次，但时间固定、可提前避开',
        1: '≥6 次且不可预料，或有 1 次全场惊跳'
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
        5: '<10 人/5 分钟，可保持 1.5 m',
        4: '10—25 人，偶需侧身',
        3: '26—45 人，需侧身，或排队 ≤3 分钟',
        2: '46—60 人，或排队 3—10 分钟，或同时停留 ≥15 人',
        1: '>60 人，或持续拥挤，或排队 >10 分钟'
      }
    },
    {
      id: 'quiet', name: '安静空间', hint: '最近能坐、能关门、比较安静的地方，记步行时间',
      anchors: {
        5: '≤3 分钟可达，可坐可关门，有标识',
        4: '≤5 分钟可达，可坐，比较安静',
        3: '有，但需消费、需询问或噪声偏高，无标识',
        2: '有，但 10 分钟以上或条件很差',
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
     缺 ≥2 → 暂无数据；任一 ≤2 → 不推荐；全部 ≥4 → 推荐；其余（最低 =3）→ 有条件推荐 */

  function level(scores) {
    var values = [];
    var missing = [];
    DIMS.forEach(function (d) {
      var v = scores[d.id];
      if (v === null || v === undefined || v === '') missing.push(d.name);
      else values.push(Number(v));
    });

    var key;
    if (values.length <= DIMS.length - 2) key = 'no_data';
    else if (values.some(function (v) { return v <= 2; })) key = 'not_recommended';
    else if (values.every(function (v) { return v >= 4; })) key = 'recommended';
    else key = 'conditional';

    var lv = LEVELS[key];
    return {
      key: key,
      label: lv.label,
      cls: lv.cls,
      glyph: lv.glyph,
      text: lv.text,
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
    store: store,
    points: points
  };
})();
