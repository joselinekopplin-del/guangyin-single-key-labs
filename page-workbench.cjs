/* Presentation only: preserve the numerical controls, frame state and exports. */
function workbench(html, prefix) {
 const version = require('./package.json').version;
 const change = (from, to) => {
  if (!html.includes(from)) throw Error('Missing workbench anchor: ' + from.slice(0, 90));
  html = html.replace(from, to);
 };
 const paths = {
  wave: '<path d="M2 12h4l2-7 4 14 3-10 2 3h5"/>',
  sliders: '<path d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v2m0 4v12M2 8h6m1 9h6m1-12h6"/>',
  books: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z"/>',
  field: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8v8H8zM12 3v3m0 12v3M3 12h3m12 0h3"/>',
  send: '<path d="M3 6h18v12H3zM3 6l9 7 9-7"/>',
  play: '<path d="M8 5l11 7-11 7z"/>'
 };
 const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
 change(`<link rel="stylesheet" href="${prefix}assets/research.css">`, `<link rel="stylesheet" href="${prefix}assets/research.css"><link rel="stylesheet" href="${prefix}assets/workbench.css?v=${version}">`);
 change('<body data-mode="joint">', '<body data-mode="joint" class="scientific-workbench">');
 change('<meta name="theme-color" content="#f5f7fa">', '<meta name="theme-color" content="#fbfcfe">');
 for (const [id, label, name] of [['experiment', '实验台', 'wave'], ['extensions', '参数分析', 'sliders'], ['research', '参考文献', 'books']]) {
  change(`data-workspace="${id}">${label}</button>`, `data-workspace="${id}">${icon(name)}<span>${label}</span></button>`);
 }
 const model = '<div class="model-strip"><span><small>波长</small><strong>532 <em>nm</em></strong></span><span><small>相位面</small><strong>64 × 64</strong></span><span><small>传播网格</small><strong>128 × 128</strong></span><span><small>训练通道</small><strong>16 <em>组</em></strong></span></div>';
 const oldModel = html.match(/<div class="model-strip">[\s\S]*?<\/div>/)?.[0];
 if (!oldModel) throw Error('Missing model specifications.');
 html = html.replace(oldModel, '');
 const masthead = /(<div class="masthead">[\s\S]*?<\/p><\/div>)(<\/div>)/;
 if (!masthead.test(html)) throw Error('Missing masthead.');
 html = html.replace(masthead, (_, content, end) => content + model + end);
 change('<aside class="control-panel">', `<aside class="control-panel"><div class="panel-heading">${icon('sliders')}<h2>联合密钥</h2><span>3 维</span></div>`);
 for (const [id, key] of [['alpha', 'polarization'], ['angle', 'rotation'], ['distance', 'distance']]) {
  change(`<div class="joint-control"><label for="${id}">`, `<div class="joint-control" data-key="${key}"><label for="${id}">`);
 }
 change('<section class="results">', '<section class="results"><section class="field-display" aria-labelledby="field-heading">');
 change('<h2>光场结果</h2>', `<h2 id="field-heading">${icon('field')}光场观测</h2>`);
 change('<div class="comm-box">', '</section><div class="comm-box">');
 change('<h2>文字传输</h2>', `<h2>${icon('send')}文字传输</h2><span class="comm-mode">同一密文 · 三参接收</span>`);
 change('<label for="message" class="field-label">', '<div class="message-flow"><div class="message-compose"><label for="message" class="field-label">');
 change('<p class="frame-label" id="frame-label">', '</div><div class="message-receive"><h3>接收结果</h3><p class="frame-label" id="frame-label">');
 change('BER 使用仿真真值计算。</p></div></section></div>', 'BER 使用仿真真值计算。</p></div></div></div></section></div>');
 change('<summary>光路示意</summary>', '<summary>光路示意<span class="optical-summary-note"><i class="key-dot pol"></i>偏振 α<span>→</span><i class="key-dot rot"></i>转角 θ<span>→</span><i class="key-dot dist"></i>层距 d<span>→</span>复场测量</span></summary>');
 change('<button id="quick-demo" class="guide-new-frame" data-lock>新建并接收</button>', `<button id="quick-demo" class="guide-new-frame" data-lock>${icon('play')}新建并接收</button>`);
 for (const file of ['joint-app.js', 'research-app.js', 'experience.js']) {
  change(`<script src="${prefix}assets/${file}"></script>`, `<script src="${prefix}assets/${file}?v=${version}"></script>`);
 }
 return html;
}
module.exports = workbench;
