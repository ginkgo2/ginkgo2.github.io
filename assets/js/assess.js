/* 评估页：渲染六项、实时定级、草稿与导出 */
(function () {
  'use strict';

  var SF = window.SF;
  var form = document.getElementById('form');
  var dimHost = document.getElementById('dims');
  var result = document.getElementById('result');
  var DRAFT_KEY = 'sf:draft';

  /* ---------- 下拉选项 ---------- */

  function fillSelect(sel, items) {
    sel.innerHTML = items.map(function (it) {
      return '<option value="' + it.id + '">' + SF.esc(it.name) + '</option>';
    }).join('');
  }

  fillSelect(document.getElementById('envType'), SF.ENV_TYPES);
  fillSelect(document.getElementById('scenario'), SF.SCENARIOS);
  form.observedAt.value = SF.nowLocal();

  /* ---------- 六项 ---------- */

  dimHost.innerHTML = SF.DIMS.map(function (d) {
    var rows = [5, 4, 3, 2, 1].map(function (n) {
      return '<label>' +
        '<input type="radio" name="' + d.id + '" value="' + n + '">' +
        '<span class="score">' + n + '</span>' +
        '<span class="txt">' + SF.esc(d.anchors[n]) + '</span>' +
        '</label>';
    }).join('');
    var unknown = '<label class="unknown">' +
      '<input type="radio" name="' + d.id + '" value="">' +
      '<span class="score">—</span>' +
      '<span class="txt">未测</span>' +
      '</label>';

    var extra = '';
    if (d.id === 'light') {
      extra = '<div class="dim-extra">' +
        '<span class="dim-extra-label">光照快查</span>' +
        '<select data-fl="lamp" aria-label="灯具">' +
          '<option value="">灯具</option>' +
          '<option value="led">LED</option>' +
          '<option value="fluorescent">荧光灯管</option>' +
          '<option value="other">其他</option>' +
        '</select>' +
        '<select data-fl="dim" aria-label="是否调光">' +
          '<option value="">调光</option>' +
          '<option value="no">不调光</option>' +
          '<option value="yes">调光</option>' +
          '<option value="unknown">不知道</option>' +
        '</select>' +
        '<select data-fl="seen" aria-label="慢动作有没有条纹">' +
          '<option value="">慢动作条纹</option>' +
          '<option value="visible">可见条纹</option>' +
          '<option value="none">未见条纹</option>' +
          '<option value="unknown">无法判断</option>' +
        '</select>' +
        '</div>';
    }

    if (d.id === 'crowd') {
      extra = '<p class="hint" data-tool="crowd"></p>';
    }

    return '<fieldset class="dim-block">' +
      '<div class="dim-head"><h3>' + SF.esc(d.name) + '</h3>' +
      '<span class="hint">' + SF.esc(d.hint) + '</span></div>' +
      '<div class="ladder">' + rows + unknown + '</div>' +
      extra +
      '</fieldset>';
  }).join('');

  /* ---------- 光度快查 ---------- */

  function readFlicker() {
    var lamp = (form.querySelector('[data-fl="lamp"]') || {}).value || '';
    var dim = (form.querySelector('[data-fl="dim"]') || {}).value || '';
    var seen = (form.querySelector('[data-fl="seen"]') || {}).value || '';
    if (!lamp && !dim && !seen) return null;

    var level = seen === 'visible' ? '高'
      : seen === 'unknown' ? '中'
      : seen === 'none' ? '低' : null;
    return { lamp: lamp || null, dim: dim || null, seen: seen || null, level: level };
  }

  /* ---------- 取值 ---------- */

  function readValues() {
    var scores = {};
    SF.DIMS.forEach(function (d) {
      var checked = form.querySelector('input[name="' + d.id + '"]:checked');
      var v = checked ? checked.value : '';
      scores[d.id] = v === '' ? null : Number(v);
    });
    return scores;
  }

  function readPoint() {
    return {
      id: form.id.value.trim(),
      name: form.name.value.trim(),
      envType: form.envType.value,
      scenario: form.scenario.value,
      observedAt: form.observedAt.value ? form.observedAt.value + ':00+08:00' : '',
      x: pos ? pos.x : null,
      y: pos ? pos.y : null,
      note: form.note.value.trim()
    };
  }

  /* ---------- 位置 ---------- */

  var pos = null;
  var pickerApi = null;

  function updatePosText() {
    var el = document.getElementById('pick-val');
    if (el) el.textContent = pos ? '坐标：' + pos.x + ', ' + pos.y : '坐标：未选';
  }

  function setPos(x, y) {
    pos = { x: x, y: y };
    updatePosText();
  }

  var pickWrap = document.getElementById('pick-wrap');
  var pickOpen = document.getElementById('pick-open');

  pickOpen.addEventListener('click', function () {
    var show = pickWrap.hidden;
    pickWrap.hidden = !show;
    pickOpen.textContent = show ? '收起地图' : '在地图上选位置';

    if (show && !pickerApi) {
      pickerApi = window.SFPicker(document.getElementById('picker'), {
        onPick: function (x, y) { setPos(x, y); }
      });
      if (pos) pickerApi.setValue(pos.x, pos.y);
    }
  });

  document.getElementById('pick-clear').addEventListener('click', function () {
    pos = null;
    if (pickerApi) pickerApi.clear();
    updatePosText();
  });

  /* ---------- 结果 ---------- */

  function renderResult() {
    var scores = readValues();
    var lv = SF.level(scores);
    var filled = SF.DIMS.filter(function (d) { return scores[d.id] !== null; }).length;

    var text;
    if (!filled) {
      text = '还没填。';
    } else if (lv.key === 'no_data') {
      text = '只填了 ' + filled + ' 项，缺两项以上不下结论。';
    } else if (lv.partial) {
      text = lv.text + '（' + lv.missing[0] + ' 未测）。';
    } else {
      text = lv.text + '。';
    }

    result.innerHTML =
      '<span class="badge badge-' + lv.cls + '"><span class="glyph" aria-hidden="true">' +
      lv.glyph + '</span>' + lv.label + '</span>' +
      '<span class="result-text">' + SF.esc(text) + '</span>';

    var bars = document.getElementById('result-bars');
    if (bars) bars.innerHTML = filled ? SF.scoreBars(scores) : '';
  }

  form.addEventListener('change', renderResult);
  form.addEventListener('input', function (e) {
    if (e.target.type !== 'radio') return;
    renderResult();
  });
  form.id.addEventListener('input', function () { renderToolsNote(); suggestCrowd(); });

  /* ---------- 工具箱带入 ---------- */

  function toolsData() {
    var t = SF.store('sf:tools');
    if (!t) return null;
    var has = t.leq != null || t.crowdCount != null || t.quietMin != null ||
      (Array.isArray(t.windows) && t.windows.length);
    return has ? t : null;
  }

  // 只有工具箱里记的是同一个点位编号，才允许带进当前评估
  function importable(pid) {
    var t = toolsData();
    if (!t) return { t: null, reason: 'empty' };
    if (!t.pointId) return { t: null, reason: 'no-point' };
    if (!pid) return { t: null, reason: 'no-id' };
    if (t.pointId !== pid) return { t: null, reason: 'mismatch', pointId: t.pointId };
    return { t: t, reason: 'ok' };
  }

  function renderToolsNote() {
    var note = document.getElementById('tools-note');
    if (!note) return;

    var imp = importable(form.id.value.trim());
    if (imp.reason === 'empty') { note.textContent = ''; return; }
    if (imp.reason === 'no-point') { note.textContent = '工具箱还没填点位编号，先回去填一下。'; return; }
    if (imp.reason === 'no-id') { note.textContent = '填了编号才会带入工具箱的测量值。'; return; }
    if (imp.reason === 'mismatch') {
      note.textContent = '工具箱里的测量属于 ' + imp.pointId + '，和当前编号不一致，不会带入。';
      return;
    }

    var t = imp.t;
    var parts = [];
    if (t.leq != null) parts.push('指示值 ' + t.leq + '（' + (t.noiseSec || 0) + ' 秒）');
    if (t.crowdCount != null) {
      parts.push((t.crowdDone ? '5 分钟 ' : '观察 ' + (t.crowdSec || 0) + ' 秒 ') + t.crowdCount + ' 人');
    }
    if (t.queueMin != null) parts.push('排队 ' + t.queueMin + ' 分钟');
    if (t.quietMin != null) parts.push('安静空间 ' + t.quietMin + ' 分钟');
    if (Array.isArray(t.windows) && t.windows.length) parts.push(t.windows.length + ' 个观察窗');
    note.textContent = parts.length ? '已带入工具箱：' + parts.join('、') : '';
  }

  /* 人流是唯一能由工具直接定分的项：锚点就是人数区间；
     噪声的指示值没校准，只显示参考，不代选。 */
  function suggestCrowd() {
    var host = form.querySelector('[data-tool="crowd"]');
    if (!host) return;

    var imp = importable(form.id.value.trim());
    if (!imp.t || imp.t.crowdCount == null) { host.textContent = ''; return; }

    var n = imp.t.crowdCount;
    var q = imp.t.queueMin;
    var peak = imp.t.peakInRoom;

    var s = n < 10 ? 5 : n <= 25 ? 4 : n <= 45 ? 3 : n <= 60 ? 2 : 1;
    var why = n + ' 人/5 分钟';

    if (q != null && q > 10) {
      s = 1;
      why += '，排队 ' + q + ' 分钟';
    } else if (q != null && q > 3 && s > 2) {
      s = 2;
      why += '，排队 ' + q + ' 分钟';
    }
    if (peak != null && peak >= 15 && s > 2) {
      s = 2;
      why += '，同时停留 ' + peak + ' 人';
    }

    var checked = form.querySelector('input[name="crowd"]:checked');
    var auto = false;
    if (!checked) {
      var target = form.querySelector('input[name="crowd"][value="' + s + '"]');
      if (target) { target.checked = true; auto = true; renderResult(); }
    }

    host.textContent = '来自工具箱：' + why + ' → 建议 ' + s + ' 分' +
      (auto ? '（已自动选）' : '（已手动选过，保留你的）');
  }

  /* ---------- 草稿 ---------- */

  function collect() {
    var p = readPoint();
    p.scores = readValues();
    p.missing = SF.DIMS.filter(function (d) { return p.scores[d.id] === null; })
      .map(function (d) { return d.id; });
    p.level = SF.level(p.scores).key;

    var imp = importable(p.id);
    if (imp.t) {
      var t = imp.t;
      p.measures = {
        leq: t.leq == null ? null : t.leq,
        lmax: t.lmax == null ? null : t.lmax,
        noiseSec: t.noiseSec == null ? null : t.noiseSec,
        count: t.crowdCount == null ? null : t.crowdCount,
        countSec: t.crowdSec == null ? null : t.crowdSec,
        count5min: (t.crowdDone && t.crowdCount != null) ? t.crowdCount : null,
        peakInRoom: t.peakInRoom == null ? null : t.peakInRoom,
        queueMin: t.queueMin == null ? null : t.queueMin,
        quietMin: t.quietMin == null ? null : t.quietMin,
        device: t.device || null
      };
      p.windows = Array.isArray(t.windows) ? t.windows : [];
      p.events = p.windows.reduce(function (all, w) {
        return all.concat(w.events || []);
      }, []);
    }

    var fl = readFlicker();
    if (fl) p.flicker = fl;

    return p;
  }

  function apply(p) {
    if (!p) return;
    form.id.value = p.id || '';
    form.name.value = p.name || '';
    form.envType.value = p.envType || 'daily';
    form.scenario.value = p.scenario || 'indoor';
    form.observedAt.value = (p.observedAt || '').slice(0, 16);
    form.note.value = p.note || '';
    SF.DIMS.forEach(function (d) {
      var v = p.scores && p.scores[d.id];
      var name = 'input[name="' + d.id + '"]';
      var target = form.querySelector(name + '[value="' + (v == null ? '' : v) + '"]');
      if (target) target.checked = true;
    });

    if (p.flicker) {
      ['lamp', 'dim', 'seen'].forEach(function (k) {
        var sel = form.querySelector('[data-fl="' + k + '"]');
        if (sel && p.flicker[k]) sel.value = p.flicker[k];
      });
    }

    if (p.x != null && p.y != null) {
      pos = { x: p.x, y: p.y };
      updatePosText();
      if (pickerApi) pickerApi.setValue(p.x, p.y);
    }

    renderResult();
  }

  document.getElementById('save').addEventListener('click', function () {
    SF.store(DRAFT_KEY, collect());
    flash('save', '已存');
  });

  document.getElementById('clear').addEventListener('click', function () {
    if (!confirm('清空当前内容？草稿也会一起清掉。')) return;
    form.reset();
    form.observedAt.value = SF.nowLocal();
    pos = null;
    if (pickerApi) pickerApi.clear();
    updatePosText();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 忽略 */ }
    renderResult();
  });

  document.getElementById('export').addEventListener('click', function () {
    var p = collect();
    if (!p.id) {
      form.id.focus();
      flash('export', '先填编号');
      return;
    }
    if (p.level === 'conditional' && !p.note) {
      form.note.focus();
      flash('export', '有条件推荐要写条件');
      return;
    }
    var blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = p.id + '_' + (p.observedAt || '').replace(/[:T+]/g, '').slice(0, 13) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    flash('export', '已导出');
  });

  function flash(id, text) {
    var btn = document.getElementById(id);
    var old = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1400);
  }

  /* ---------- 启动 ---------- */

  apply(SF.store(DRAFT_KEY));
  renderResult();
  renderToolsNote();
  suggestCrowd();
})();
