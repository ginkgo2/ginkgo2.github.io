/* 工具箱：分贝计、频闪自查、事件记录器、人流计数
   全部在本地跑，结果写进 localStorage 的 sf:tools，评估页会读走。 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'sf:tools';
  var OFFSET = 100; // dBFS → 指示值的粗略偏移，未校准，同一台手机内部可比

  function load() { return window.SF.store(KEY) || {}; }

  function save(patch) {
    var t = load();
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    t.updatedAt = new Date().toISOString();
    window.SF.store(KEY, t);
    return t;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function clock(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
  function left(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  /* ---------- 麦克风 ---------- */

  var Mic = {
    ctx: null,
    analyser: null,
    data: null,
    ready: false,
    ensure: function () {
      if (this.ready) return Promise.resolve();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return Promise.reject(new Error('这个浏览器不支持麦克风'));
      }
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      }).then(function (stream) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        Mic.ctx = new Ctx();
        var src = Mic.ctx.createMediaStreamSource(stream);
        Mic.analyser = Mic.ctx.createAnalyser();
        Mic.analyser.fftSize = 2048;
        Mic.analyser.smoothingTimeConstant = 0;
        src.connect(Mic.analyser);
        Mic.data = new Float32Array(Mic.analyser.fftSize);
        Mic.ready = true;
        if (Mic.ctx.state === 'suspended') Mic.ctx.resume();
      });
    },
    rms: function () {
      if (!this.analyser) return 0;
      this.analyser.getFloatTimeDomainData(this.data);
      var sum = 0, d = this.data;
      for (var i = 0; i < d.length; i++) sum += d[i] * d[i];
      return Math.sqrt(sum / d.length);
    }
  };

  /* ---------- 分贝计 ---------- */

  var dbTimer = null;
  var db = { sumSq: 0, n: 0, max: -Infinity };

  $('db-start').addEventListener('click', function () {
    if (dbTimer) { stopDb(); return; }

    $('db-msg').textContent = '请求麦克风……';
    Mic.ensure().then(function () {
      $('db-msg').textContent = '同一台手机、同一个位置，测完去评估页导出。';
      db = { sumSq: 0, n: 0, max: -Infinity };
      var end = Date.now() + 30000;
      $('db-start').textContent = '停止';

      dbTimer = setInterval(function () {
        var r = Mic.rms();
        db.sumSq += r * r;
        db.n++;

        var dbfs = r > 0 ? 20 * Math.log10(r) : -100;
        if (dbfs > db.max) db.max = dbfs;

        var shown = dbfs + OFFSET;
        $('db-bar').style.width = Math.max(0, Math.min(100, (shown - 30) / 60 * 100)) + '%';
        $('db-avg').textContent = Math.round(10 * Math.log10(db.sumSq / db.n) + OFFSET);

        var rest = end - Date.now();
        $('db-timer').textContent = left(rest);
        if (rest <= 0) stopDb();
      }, 125);
    }).catch(function (err) {
      $('db-msg').textContent = '打不开麦克风：' +
        (err && err.message ? err.message : '需要 HTTPS 和授权');
    });
  });

  function stopDb() {
    if (dbTimer) { clearInterval(dbTimer); dbTimer = null; }
    $('db-start').textContent = '再测 30 秒';
    $('db-timer').textContent = '00:00';
    if (!db.n) return;

    var avg = Math.round(10 * Math.log10(db.sumSq / db.n) + OFFSET);
    var max = Math.round(db.max + OFFSET);
    $('db-avg').textContent = avg;
    $('db-max').textContent = max;
    save({ leq: avg, lmax: max, device: navigator.userAgent.slice(0, 48) });
  }

  /* ---------- 频闪自查 ---------- */

  function flicker() {
    var lamp = $('fl-lamp').value;
    var seen = $('fl-seen').value;
    var level, note;

    if (seen === 'visible') {
      level = '高';
      note = '回放能看到明暗条纹';
    } else if (seen === 'unknown') {
      level = '中';
      note = '无法判断，按中等记，换个角度再拍一次';
    } else {
      level = '低';
      note = '未见条纹';
      if (lamp === 'fluorescent') note += '；荧光灯通常有频闪，建议再拍一次';
    }

    $('fl-level').textContent = level + '（' + note + '）';
    save({
      flicker: { level: level, lamp: lamp, dim: $('fl-dim').value, seen: seen, note: note }
    });
  }

  ['fl-lamp', 'fl-dim', 'fl-seen'].forEach(function (id) {
    $(id).addEventListener('change', flicker);
  });

  /* ---------- 事件记录器 ---------- */

  var saved = load();
  var events = Array.isArray(saved.events) ? saved.events : [];

  function typeLabel(value) {
    var opt = $('ev-type').querySelector('option[value="' + value + '"]');
    return opt ? opt.textContent : value;
  }

  function renderEvents() {
    $('ev-list').innerHTML = events.slice().reverse().map(function (e) {
      var peak = e.peak == null ? '—' : e.peak + ' 指示值';
      return '<li><span class="ev-time">' + e.t + '</span><span>' +
        window.SF.esc(typeLabel(e.type)) +
        (e.expected ? ' · 可预料' : ' · 不可预料') +
        '</span><span>' + peak + ' · ' + e.dur + ' s</span></li>';
    }).join('');
  }

  var hold = { on: false, start: 0, peak: -Infinity, timer: null };

  $('ev-btn').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (hold.on) return;
    hold.on = true;
    hold.start = Date.now();
    hold.peak = -Infinity;
    $('ev-btn').classList.add('is-down');
    $('ev-btn').textContent = '松手结束';

    hold.timer = setInterval(function () {
      if (!Mic.ready) return;
      var r = Mic.rms();
      var d = r > 0 ? 20 * Math.log10(r) : -100;
      if (d > hold.peak) hold.peak = d;
    }, 80);
  });

  function endHold() {
    if (!hold.on) return;
    hold.on = false;
    clearInterval(hold.timer);
    $('ev-btn').classList.remove('is-down');
    $('ev-btn').textContent = '按住记录';

    var dur = Math.max(0.2, (Date.now() - hold.start) / 1000);
    var peak = (Mic.ready && isFinite(hold.peak)) ? Math.round(hold.peak + OFFSET) : null;

    events.push({
      t: clock(new Date()),
      type: $('ev-type').value,
      expected: $('ev-expected').value === 'true',
      peak: peak,
      dur: Math.round(dur * 10) / 10
    });
    save({ events: events });
    renderEvents();
  }

  document.addEventListener('pointerup', endHold);
  document.addEventListener('pointercancel', endHold);

  /* ---------- 人流计数 ---------- */

  var cw = { timer: null, count: 0, start: 0, end: 0 };

  $('cw-start').addEventListener('click', function () {
    if (cw.timer) { finishCw(); return; }

    cw.count = 0;
    cw.start = Date.now();
    cw.end = cw.start + 300000;
    $('cw-count').textContent = '0';
    $('cw-rate').textContent = '—';
    $('cw-btn').disabled = false;
    $('cw-start').textContent = '结束';

    cw.timer = setInterval(function () {
      var rest = cw.end - Date.now();
      $('cw-timer').textContent = left(rest);

      var mins = (Date.now() - cw.start) / 60000;
      if (mins > 0.05) $('cw-rate').textContent = (cw.count / mins).toFixed(1);

      if (rest <= 0) finishCw();
    }, 250);
  });

  $('cw-btn').addEventListener('click', function () {
    if ($('cw-btn').disabled) return;
    cw.count++;
    $('cw-count').textContent = cw.count;
  });

  function finishCw() {
    if (cw.timer) { clearInterval(cw.timer); cw.timer = null; }
    $('cw-btn').disabled = true;
    $('cw-start').textContent = '再测 5 分钟';
    $('cw-timer').textContent = '00:00';
    save({
      count5min: cw.count,
      peakInRoom: Number($('cw-peak').value) || null
    });
  }

  $('cw-peak').addEventListener('change', function () {
    save({ peakInRoom: Number($('cw-peak').value) || null });
  });

  /* ---------- 清空 ---------- */

  $('clear-tools').addEventListener('click', function () {
    if (!confirm('清空工具箱里的测量值？')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }

    events = [];
    renderEvents();
    $('db-avg').textContent = '—';
    $('db-max').textContent = '—';
    $('db-timer').textContent = '00:30';
    $('db-start').textContent = '开始 30 秒';
    $('db-msg').textContent = '';
    $('cw-count').textContent = '0';
    $('cw-rate').textContent = '—';
    $('cw-timer').textContent = '05:00';
    $('cw-peak').value = '';
  });

  /* ---------- 恢复上次的显示 ---------- */

  renderEvents();
  if (saved.leq != null) $('db-avg').textContent = saved.leq;
  if (saved.lmax != null) $('db-max').textContent = saved.lmax;
  if (saved.count5min != null) $('cw-count').textContent = saved.count5min;
  if (saved.peakInRoom != null) $('cw-peak').value = saved.peakInRoom;
})();
