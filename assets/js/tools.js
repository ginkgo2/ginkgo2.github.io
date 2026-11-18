/* 工具箱：分贝计、十分钟观察、人流与排队、安静空间计时
   所有测量挂在当前会话上（点位编号 + 会话号），评估页只认同一编号的数据。 */
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

  function numOrNull(v) {
    return v === '' || v == null ? null : Number(v);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function clock(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }

  /* ---------- 会话 ---------- */

  function startSession(pointId) {
    var t = {
      pointId: pointId || '',
      sessionId: 'S' + Date.now().toString(36),
      startedAt: new Date().toISOString(),
      windows: []
    };
    window.SF.store(KEY, t);
    return t;
  }

  function sessionLabel(t) {
    if (!t || !t.sessionId) return '';

    var parts = [];
    if (t.leq != null) parts.push('分贝 ' + t.leq);
    if (t.crowdCount != null) parts.push('人流 ' + t.crowdCount + ' 人');
    if (t.quietMin != null) parts.push('安静空间 ' + t.quietMin + ' 分钟');
    if (Array.isArray(t.windows) && t.windows.length) parts.push(t.windows.length + ' 个观察窗');

    return parts.length ? '本会话已测：' + parts.join('、') : '本会话还没有测量';
  }

  var current = load();
  if (!current.sessionId) current = startSession(current.pointId || '');

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
  var db = { sumSq: 0, n: 0, max: -Infinity, start: 0 };

  $('db-start').addEventListener('click', function () {
    if (dbTimer) { stopDb(); return; }

    $('db-msg').textContent = '请求麦克风……';
    Mic.ensure().then(function () {
      $('db-msg').textContent = '同一台手机、同一个位置，测完去评估页。';
      db = { sumSq: 0, n: 0, max: -Infinity, start: Date.now() };
      var end = db.start + 30000;
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
        $('db-timer').textContent = mmss(rest);
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

    var sec = Math.round((Date.now() - db.start) / 1000);
    var avg = Math.round(10 * Math.log10(db.sumSq / db.n) + OFFSET);
    var max = Math.round(db.max + OFFSET);
    $('db-avg').textContent = avg;
    $('db-max').textContent = max;
    save({
      leq: avg,
      lmax: max,
      noiseSec: sec,
      noiseDone: sec >= 30,
      device: navigator.userAgent.slice(0, 48)
    });
    $('db-msg').textContent = sec >= 30 ? '' : '只测了 ' + sec + ' 秒，没满 30 秒。';
  }

  /* ---------- 十分钟观察 ---------- */

  var ob = { timer: null, start: 0, end: 0, index: -1 };

  function windows() {
    var t = load();
    return Array.isArray(t.windows) ? t.windows : [];
  }

  function typeLabel(value) {
    var opt = $('ob-type').querySelector('option[value="' + value + '"]');
    return opt ? opt.textContent : value;
  }

  function renderEvents() {
    var list = windows();
    var w = ob.index >= 0 ? list[ob.index] : list[list.length - 1];
    var events = w && Array.isArray(w.events) ? w.events : [];

    $('ob-list').innerHTML = events.slice().reverse().map(function (e) {
      return '<li><span class="ev-time">' + e.t + '</span><span>' +
        window.SF.esc(typeLabel(e.type)) +
        (e.expected ? ' · 可预料' : ' · 不可预料') +
        '</span><span></span></li>';
    }).join('');

    var total = list.reduce(function (n, x) { return n + (x.events ? x.events.length : 0); }, 0);
    $('ob-count').textContent = events.length;
    $('ob-total').textContent = total;
    $('ob-window').textContent = list.length ? ('第 ' + list.length + ' 窗') : '未开始';
  }

  $('ob-start').addEventListener('click', function () {
    if (ob.timer) { finishOb(); return; }

    var list = windows();
    list.push({
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationSec: 0,
      completed: false,
      events: []
    });
    save({ windows: list });

    ob.index = list.length - 1;
    ob.start = Date.now();
    ob.end = ob.start + 600000;
    $('ob-btn').disabled = false;
    $('ob-start').textContent = '结束观察';
    renderEvents();

    ob.timer = setInterval(function () {
      var rest = ob.end - Date.now();
      $('ob-timer').textContent = mmss(rest);

      var mins = (Date.now() - ob.start) / 60000;
      var w = windows()[ob.index];
      if (mins > 0.2 && w) $('ob-rate').textContent = (w.events.length / mins).toFixed(1);

      if (rest <= 0) finishOb();
    }, 250);
  });

  $('ob-btn').addEventListener('click', function () {
    if ($('ob-btn').disabled) return;

    var list = windows();
    var w = list[ob.index];
    if (!w) return;

    w.events.push({
      t: clock(new Date()),
      type: $('ob-type').value,
      expected: $('ob-expected').value === 'true'
    });
    save({ windows: list });
    renderEvents();

    var mins = ob.start ? (Date.now() - ob.start) / 60000 : 0;
    if (mins > 0.2) $('ob-rate').textContent = (w.events.length / mins).toFixed(1);
  });

  function finishOb() {
    if (ob.timer) { clearInterval(ob.timer); ob.timer = null; }
    $('ob-btn').disabled = true;
    $('ob-start').textContent = '再观察 10 分钟';
    $('ob-timer').textContent = '00:00';

    var list = windows();
    var w = list[ob.index];
    if (w) {
      var sec = Math.round((Date.now() - ob.start) / 1000);
      w.endedAt = new Date().toISOString();
      w.durationSec = sec;
      w.completed = sec >= 600;
      save({ windows: list });
    }
    ob.index = -1;
    renderEvents();
  }

  /* ---------- 人流与排队 ---------- */

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
      $('cw-timer').textContent = mmss(rest);

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

    var sec = Math.round((Date.now() - cw.start) / 1000);
    save({
      crowdCount: cw.count,
      crowdSec: sec,
      crowdDone: sec >= 300,
      peakInRoom: numOrNull($('cw-peak').value)
    });
    $('cw-timer').textContent = mmss(sec * 1000);
    if (sec < 300) $('cw-timer').textContent += '（未满 5 分钟）';
  }

  ['cw-peak'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      save({
        peakInRoom: numOrNull($('cw-peak').value)
      });
    });
  });

  /* ---------- 安静空间计时 ---------- */

  var qt = { timer: null, start: 0 };

  $('qt-btn').addEventListener('click', function () {
    if (!qt.timer) {
      qt.start = Date.now();
      $('qt-btn').textContent = '到了，停';
      $('qt-msg').textContent = '';
      qt.timer = setInterval(function () {
        $('qt-time').textContent = mmss(Date.now() - qt.start);
      }, 250);
      return;
    }

    clearInterval(qt.timer);
    qt.timer = null;
    var sec = Math.round((Date.now() - qt.start) / 1000);
    var min = Math.round(sec / 60 * 10) / 10;
    $('qt-btn').textContent = '再走一次';
    $('qt-time').textContent = mmss(sec * 1000);

    var band = min <= 3 ? '3 分钟以内，时长上够 5 分' :
               min <= 5 ? '3—5 分钟，时长上够 4 分' :
               min <= 10 ? '5—10 分钟，时长上够 3 分' : '10 分钟以上，时长上够 2 分';
    $('qt-msg').textContent = '走了 ' + min + ' 分钟，' + band + '；能不能坐、能不能关门、有没有标识要一并看。';
    save({ quietMin: min, quietSec: sec });
  });

  /* ---------- 点位与会话 ---------- */

  function refreshSession() {
    var t = load();
    $('sess-id').value = t.pointId || '';
    $('sess-msg').textContent = sessionLabel(t);
  }

  $('sess-id').addEventListener('change', function () {
    var t = load();
    var next = $('sess-id').value.trim();
    if (next === (t.pointId || '')) return;

    var hasData = t.sessionId && (t.leq != null || t.crowdCount != null ||
      (t.windows && t.windows.length) || t.quietMin != null);
    if (hasData && !confirm('换点位会清空当前测量，确定？')) {
      $('sess-id').value = t.pointId || '';
      return;
    }
    startSession(next);
    resetUI();
    refreshSession();
  });

  $('sess-new').addEventListener('click', function () {
    var t = load();
    if (!confirm('开新会话会清空当前测量，确定？')) return;
    startSession(t.pointId || '');
    resetUI();
    refreshSession();
  });

  function resetUI() {
    $('db-avg').textContent = '—';
    $('db-max').textContent = '—';
    $('db-timer').textContent = '00:30';
    $('db-start').textContent = '开始 30 秒';
    $('db-msg').textContent = '';
    $('ob-count').textContent = '0';
    $('ob-total').textContent = '0';
    $('ob-rate').textContent = '—';
    $('ob-timer').textContent = '10:00';
    $('ob-list').innerHTML = '';
    $('cw-count').textContent = '0';
    $('cw-rate').textContent = '—';
    $('cw-timer').textContent = '05:00';
    $('cw-peak').value = '';
    $('qt-time').textContent = '00:00';
    $('qt-msg').textContent = '';
    $('qt-btn').textContent = '开始计时';
  }

  /* ---------- 恢复上次的显示 ---------- */

  (function restore() {
    var t = load();
    refreshSession();
    if (t.leq != null) $('db-avg').textContent = t.leq;
    if (t.lmax != null) $('db-max').textContent = t.lmax;
    if (t.crowdCount != null) $('cw-count').textContent = t.crowdCount;
    if (t.crowdSec != null) $('cw-timer').textContent = mmss(t.crowdSec * 1000);
    if (t.peakInRoom != null) $('cw-peak').value = t.peakInRoom;
    if (t.quietSec != null) $('qt-time').textContent = mmss(t.quietSec * 1000);
    renderEvents();
  })();
})();
