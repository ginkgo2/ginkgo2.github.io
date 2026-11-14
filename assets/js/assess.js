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
      note: form.note.value.trim()
    };
  }

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
      text = lv.text + '。缺一项：' + lv.missing[0] + ' 未测。';
    } else {
      text = lv.text + '。';
    }

    result.innerHTML =
      '<span class="badge badge-' + lv.cls + '"><span class="glyph" aria-hidden="true">' +
      lv.glyph + '</span>' + lv.label + '</span>' +
      '<span class="result-text">' + SF.esc(text) + '</span>';
  }

  form.addEventListener('change', renderResult);
  form.addEventListener('input', function (e) {
    if (e.target.type !== 'radio') return;
    renderResult();
  });

  /* ---------- 工具箱带入 ---------- */

  function readTools() {
    var t = SF.store('sf:tools');
    if (!t) return null;
    var has = t.leq != null || t.count5min != null || t.quietMin != null ||
      (Array.isArray(t.events) && t.events.length);
    return has ? t : null;
  }

  function renderToolsNote() {
    var note = document.getElementById('tools-note');
    if (!note) return;
    var t = readTools();
    if (!t) { note.textContent = ''; return; }

    var parts = [];
    if (t.leq != null) parts.push('指示值 ' + t.leq);
    if (t.count5min != null) parts.push('5 分钟 ' + t.count5min + ' 人');
    if (t.queueMin != null) parts.push('排队 ' + t.queueMin + ' 分钟');
    if (t.quietMin != null) parts.push('安静空间 ' + t.quietMin + ' 分钟');
    if (Array.isArray(t.events) && t.events.length) parts.push(t.events.length + ' 次事件');
    note.textContent = parts.length ? '已带入工具箱：' + parts.join('、') : '';
  }

  /* ---------- 草稿 ---------- */

  function collect() {
    var p = readPoint();
    p.scores = readValues();
    p.missing = SF.DIMS.filter(function (d) { return p.scores[d.id] === null; })
      .map(function (d) { return d.id; });
    p.level = SF.level(p.scores).key;

    var t = readTools();
    if (t) {
      p.measures = {
        leq: t.leq == null ? null : t.leq,
        lmax: t.lmax == null ? null : t.lmax,
        count5min: t.count5min == null ? null : t.count5min,
        peakInRoom: t.peakInRoom == null ? null : t.peakInRoom,
        queueMin: t.queueMin == null ? null : t.queueMin,
        quietMin: t.quietMin == null ? null : t.quietMin,
        device: t.device || null
      };
      p.events = Array.isArray(t.events) ? t.events : [];
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
})();
