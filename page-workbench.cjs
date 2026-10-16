/* Presentation only: preserve the numerical controls, frame state and exports. */
function workbench(html, prefix) {
 const version = require('./package.json').version;
 const change = (from, to) => {
  if (!html.includes(from)) throw Error('Missing workbench anchor: ' + from.slice(0, 90));
  html = html.replace(from, to);
 };
 change(`<link rel="stylesheet" href="${prefix}assets/research.css">`, `<link rel="stylesheet" href="${prefix}assets/research.css"><link rel="stylesheet" href="${prefix}assets/workbench.css?v=${version}">`);
 change('<body data-mode="joint">', '<body data-mode="joint" class="scientific-workbench">');
 change('<meta name="theme-color" content="#f5f7fa">', '<meta name="theme-color" content="#ffffff">');
 change(`<link rel="icon" href="${prefix}assets/favicon.svg">`, `<link rel="icon" type="image/svg+xml" href="${prefix}assets/favicon.svg?v=${version}">`);
 change(`<img src="${prefix}assets/favicon.svg" alt="">`, '');
 change('匹配、错钥和校准操作会沿用当前密文；没有密文时会先生成一帧。', '匹配、错钥和校准复用当前密文；“新建并接收”另开一帧。');
 change('每个通道对应完整的 (α, θ, d) 组合，三个条件共同决定输出。', '通道同时确定偏振 α、转角 θ 和层距 d。');
 change('用于测试下方导频校准。', '可在“参数分析”中运行导频校准。');
 const model = '<div class="model-strip"><span><small>波长</small><strong>532 <em>nm</em></strong></span><span><small>相位面</small><strong>64 × 64</strong></span><span><small>传播网格</small><strong>128 × 128</strong></span><span><small>训练通道</small><strong>16 <em>组</em></strong></span></div>';
 const oldModel = html.match(/<div class="model-strip">[\s\S]*?<\/div>/)?.[0];
 if (!oldModel) throw Error('Missing model specifications.');
 html = html.replace(oldModel, '');
 const masthead = /(<div class="masthead">[\s\S]*?<\/p><\/div>)(<\/div>)/;
 if (!masthead.test(html)) throw Error('Missing masthead.');
 html = html.replace(masthead, (_, content, end) => content + model + end);
 change('<aside class="control-panel">', '<aside class="control-panel"><div class="panel-heading"><h2>联合密钥</h2></div>');
 for (const [id, key] of [['alpha', 'polarization'], ['angle', 'rotation'], ['distance', 'distance']]) {
  change(`<div class="joint-control"><label for="${id}">`, `<div class="joint-control" data-key="${key}"><label for="${id}">`);
 }
 change('<section class="results">', '<section class="results"><section class="field-display" aria-labelledby="field-heading">');
 change('<h2>光场结果</h2>', '<h2 id="field-heading">光场观测</h2>');
 for (const [from,to] of [['训练目标字符','训练目标'],['当前联合重建','当前重建'],['本次通信密文强度','密文强度']]) {
  change(`<strong>${from}</strong>`, `<strong>${to}</strong>`);
 }
 change('<span>与目标的相关系数 NCC</span>', '<span>目标相关性 NCC</span>');
 change('<span>图像 PSNR / dB</span>', '<span>PSNR / dB</span>');
 change('<span>目标区域能量占比</span>', '<span>区域能量占比</span>');
 change('<div class="comm-box">', '</section><div class="comm-box">');
 change('<label for="message" class="field-label">', '<div class="message-flow"><div class="message-compose"><label for="message" class="field-label">');
 change('<p class="frame-label" id="frame-label">', '</div><div class="message-receive"><h3>接收结果</h3><p class="frame-label" id="frame-label">');
 change('BER 使用仿真真值计算。</p></div></section></div>', 'BER 使用仿真真值计算。</p></div></div></div></section></div>');
 change('<details class="optical" id="optical-panel">', '<details class="optical" id="optical-panel" open>');
 for (const [shape, role] of [
  ['<rect x="35"', 'diagram-source'],
  ['<ellipse cx="210"', 'diagram-polarizer'],
  ['<rect x="370"', 'diagram-layer'],
  ['<rect x="725"', 'diagram-layer'],
  ['<rect x="905"', 'diagram-receiver']
 ]) change(shape, shape.replace(' ', ` class="${role}" `));
 change('<summary>光路示意</summary>', '<summary>光路示意<span class="optical-summary-note"><i class="key-dot pol"></i>偏振 α<span>→</span><i class="key-dot rot"></i>转角 θ<span>→</span><i class="key-dot dist"></i>层距 d<span>→</span>复场测量</span></summary>');
 for (const file of ['joint-app.js', 'research-app.js', 'experience.js']) {
  change(`<script src="${prefix}assets/${file}"></script>`, `<script src="${prefix}assets/${file}?v=${version}"></script>`);
 }
 return html;
}
module.exports = workbench;
