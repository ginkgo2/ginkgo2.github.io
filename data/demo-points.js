/* 示例数据：仅在网址带 ?demo=1 时加载，用来预览有数据时的样子。
   不是真实评估结果，页面会挂横幅提示。正式数据由 scripts/merge.mjs 生成到 points.js。 */
(function () {
  if (!/[?&]demo=1/.test(location.search)) return;

  var demo = [
    {
      id: 'DEMO-01', name: '某社区卫生服务中心', envType: 'daily',
      x: 692, y: 372, observedAt: '2026-11-10T09:20:00+08:00',
      level: 'recommended',
      scores: { noise: 5, surprise: 4, crowd: 4, quiet: 5, light: 4, smell: 5 },
      note: '工作日上午人少，门口排队区安静。'
    },
    {
      id: 'DEMO-02', name: '某小学门口', envType: 'path',
      x: 648, y: 405, observedAt: '2026-11-10T15:40:00+08:00',
      level: 'conditional',
      scores: { noise: 4, surprise: 3, crowd: 4, quiet: 4, light: 4, smell: 4 },
      note: '避开放学时段；广播每节课后会响一次。'
    },
    {
      id: 'DEMO-03', name: '某菜市场', envType: 'daily',
      x: 706, y: 418, observedAt: '2026-11-11T08:30:00+08:00',
      level: 'not_recommended',
      scores: { noise: 3, surprise: 2, crowd: 5, quiet: 5, light: 4, smell: 4 },
      note: '叫卖和喇叭声频繁，不适合对突发声敏感的情况。'
    },
    {
      id: 'DEMO-04', name: '某公交站', envType: 'path',
      x: 610, y: 350, observedAt: '2026-11-11T10:10:00+08:00',
      level: 'conditional',
      missing: ['光环境与视觉杂乱'],
      scores: { noise: 4, surprise: 4, crowd: 4, quiet: 4, light: null, smell: 4 },
      note: '光环境未测；站台有顶棚，车流声持续。'
    },
    {
      id: 'DEMO-05', name: '某公园入口', envType: 'public',
      x: 560, y: 466, observedAt: '2026-11-12T16:00:00+08:00',
      level: 'recommended',
      scores: { noise: 4, surprise: 5, crowd: 5, quiet: 4, light: 5, smell: 5 },
      note: '下午人少，绿化带能挡一部分车声。'
    },
    {
      id: 'DEMO-06', name: '某商场一层', envType: 'venue',
      x: 735, y: 330, observedAt: '2026-11-12T18:20:00+08:00',
      level: 'no_data',
      missing: ['人流拥挤', '安静空间'],
      scores: { noise: 4, surprise: 4, crowd: null, quiet: null, light: 4, smell: 4 },
      note: '人流和安静空间都没测，不下结论。'
    }
  ];

  window.SF_POINTS = demo;

  function banner() {
    var el = document.createElement('div');
    el.className = 'demo-banner';
    el.innerHTML = '<strong>示例数据</strong>：用来预览有数据时的样子，不是真实评估结果。' +
      '去掉网址里的 <code>?demo=1</code> 即可回到正式数据。';
    document.body.insertBefore(el, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', banner);
  } else {
    banner();
  }
})();
