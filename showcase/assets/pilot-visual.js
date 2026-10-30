/* 归档研究的可视化适配层。不调用传播器，不访问演示明文、观测或密钥。 */
(() => {
 'use strict';
 const root=document.getElementById('view-pilots'); if(!root)return;
 const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
 const blue='#245bc4',orange='#ae4b1b',teal='#006d67';
 const state={tab:'budget',drift:'joint',snr:60,method:'E1',K:1,scheme:'C',extra:'cumulative',extraSnr:60};
 let data=null,loading=false,currentExport=null,resizeTimer;
 const labels={L:'L · 预配置接收',E1:'E1 · 未知准确参数',E2:'E2 · 信息对等',E1_header:'E1 + 长度头',L_header:'L + 长度头',linear:'线性解码',linear_header:'线性解码 + 长度头',no_calibration:'不校准',ideal:'真实参数参考'};
 const drifts={joint:'三参数联合偏差',nominal:'标称条件',alpha:'仅入射偏振偏差',theta:'仅第二层转角偏差',distance:'仅 L₂–L₃ 间距偏差'};
 const info={
  L:'发送前已有名义通道预配置，不知道实际偏差；使用专用导频校准。本比较不利用数据帧中的公开长度头。',
  E1:'只知道 16 个公开候选通道邻域。有训练时先比较各中心，再从 2 个初值连续搜索；K=0 时枚举 16 个中心并检查 CRC。获得与 L 相同的一份观测。',
  E2:'与 L 的先验、观测、算法和计算预算完全相同，是信息对等控制。身份标签不带来额外优势。',
  E1_header:'在 E1 的公开信息上，再使用固定 4 字节负载所对应的已知长度头及其实际接收观测，不增加发送帧数。',
  L_header:'与 L 相同的预配置，再利用实际数据首帧中的公开长度头；不读取其他未知负载。',
  linear:'只用实际公开的专用训练输入及观测拟合线性解码关系，不估计三个物理参数。K=0 时不适用。',
  linear_header:'使用专用训练及公开长度头拟合线性解码关系，不需要猜中物理参数。未知数据帧不作为已知训练。',
  no_calibration:'保持预配置的三个物理参数，不搜索偏差；K>0 时仍用导频拟合公共复增益。不是完全不使用训练信息。',
  ideal:'由评价程序提供真实物理参数，作为性能上限诊断；实际接收器和未知参数方没有这一信息。'
 };
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:n,minimumFractionDigits:n}):'—';
 const pct=(v,n=1)=>Number.isFinite(v)?num(v*100,n)+'%':'—';
 const small=v=>!Number.isFinite(v)?'不适用':v===0?'0':Math.abs(v)<.001?v.toExponential(2):num(v,4);
 const snrLabel=s=>s===null?'无噪声诊断':`参考 SNR ${s} dB`;
 const rowValid=r=>r&&Number.isFinite(r.rate)&&r.n>0;
 const exact=(a,k)=>a.find(r=>r.K===k);
 const rows=(query)=>data.by_condition.filter(r=>Object.keys(query).every(k=>r[k]===query[k])).sort((a,b)=>a.K-b.K);
 function element(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
 function legend(id,series){$(id).innerHTML=series.map(s=>`<span><i style="--series-color:${s.color}"></i>${esc(s.label)}</span>`).join('');}
 function series(label,color,records,dashed=false){return {label,color,records,dashed};}
 function chart(id,seriesList,{xTitle='额外专用训练帧 K',selected=null,selectable=false,categories=null,yKey='rate',yMax=1,yTitle='完整包正确率 (%)',target=true}={}){
  const box=$(id);box.replaceChildren();
  const valid=seriesList.flatMap(s=>s.records).filter(r=>Number.isFinite(r[yKey]));
  if(!valid.length){box.innerHTML='<p class="pv-chart-empty">尚未计算或本条件不适用</p>';return;}
  const W=Math.max(260,Math.round(box.clientWidth||600)),H=320,left=44,right=18,top=28,bottom=62;
  const pw=W-left-right,ph=H-top-bottom;
  const keys=[...new Set(valid.map(r=>r.K))].sort((a,b)=>a-b), maxK=Math.max(...keys,1);
  const x=k=>categories?left+pw*(k+.5)/categories.length:left+pw*k/maxK;
  const y=v=>top+ph*(1-v/yMax);
  const svg=element('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':yTitle+'；'+xTitle});
  svg.append(element('title',{},`${yTitle}：归档实测点；${xTitle}`));
  svg.append(element('desc',{},'坐标和数据见下方表格。所有点来自已保存研究统计，不生成未测点。'));
  for(let i=0;i<=5;i++){const v=yMax*i/5;svg.append(element('line',{x1:left,y1:y(v),x2:W-right,y2:y(v),class:'pv-grid'}));svg.append(element('text',{x:left-9,y:y(v)+4,'text-anchor':'end'},yKey==='rate'?Math.round(v*100):num(v,1)));}
  svg.append(element('text',{x:left,y:14,class:'pv-axis-title'},yTitle));
  let ticks=categories?categories.map((_,i)=>i):keys;
  if(!categories&&W<500&&keys.length>6)ticks=[0,4,8,12,16].filter(k=>k<=maxK);
  if(!categories&&maxK>16)ticks=[0,8,16,32,48].filter(k=>k<=maxK);
  for(const k of ticks){svg.append(element('text',{x:x(k),y:H-bottom+24,'text-anchor':'middle'},categories?categories[k]:k));}
  svg.append(element('text',{x:left+pw/2,y:H-12,'text-anchor':'middle',class:'pv-axis-title'},xTitle));
  if(target&&yKey==='rate'){svg.append(element('line',{x1:left,y1:y(.99),x2:W-right,y2:y(.99),stroke:'#8fa6c5','stroke-dasharray':'2 5'}));}
  if(selected!==null&&(!categories?keys.includes(selected):true))svg.append(element('line',{x1:x(selected),x2:x(selected),y1:top,y2:H-bottom,stroke:'#b6c8e2','stroke-width':12,opacity:.3}));
  seriesList.forEach((s,si)=>{
   const values=s.records.filter(r=>Number.isFinite(r[yKey])).sort((a,b)=>a.K-b.K);
   if(!categories&&values.length>1)svg.append(element('polyline',{points:values.map(r=>`${x(r.K)},${y(r[yKey])}`).join(' '),fill:'none',stroke:s.color,'stroke-width':2.3,'stroke-dasharray':s.dashed?'5 4':'none',opacity:.85}));
   values.forEach(r=>{
    const xx=x(r.K)+(categories?(si-(seriesList.length-1)/2)*Math.min(26,pw/categories.length/4):0), yy=y(r[yKey]);
    if(yKey==='rate'&&r.ci95_two_sided?.every(Number.isFinite)){
     const [lo,hi]=r.ci95_two_sided;svg.append(element('line',{x1:xx,x2:xx,y1:y(lo),y2:y(hi),stroke:s.color,'stroke-width':1.3,opacity:.5}));
     [lo,hi].forEach(v=>svg.append(element('line',{x1:xx-4,x2:xx+4,y1:y(v),y2:y(v),stroke:s.color,'stroke-width':1.3,opacity:.7})));
    }
    if(categories&&yKey!=='rate')svg.append(element('rect',{x:xx-20,y:yy,width:40,height:y(0)-yy,fill:s.color,opacity:r.K===selected?1:.65,rx:3}));
    const attrs={cx:xx,cy:yy,r:r.K===selected?6:4.5,fill:si===1?'white':s.color,stroke:s.color,'stroke-width':si===1?2.4:1.5,class:'pv-point'};
    if(selectable)Object.assign(attrs,{tabindex:0,role:'button','data-pilot-k':r.K,'aria-label':`${s.label}，K=${r.K}，${r.success}/${r.n}，正确率${pct(r.rate)}`});
    const point=element('circle',attrs);point.append(element('title',{},`${s.label} · K=${r.K}\n${yKey==='rate'?`${r.success}/${r.n}，${pct(r.rate)}`:num(r[yKey])}${r.ci95_two_sided&&yKey==='rate'?`\n95%区间 ${pct(r.ci95_two_sided[0])}–${pct(r.ci95_two_sided[1])}`:''}`));svg.append(point);
    if(categories&&yKey!=='rate')svg.append(element('text',{x:xx,y:yy-10,'text-anchor':'middle'},num(r[yKey])));
   });
  });box.append(svg);
 }
 function receiverBlock(label,r,color){
  if(!r)return `<div class="pv-receiver-result"><div class="pv-metric-head"><span>${esc(label)}</span><b>未计算</b></div></div>`;
  if(!rowValid(r))return `<div class="pv-receiver-result"><div class="pv-metric-head"><span>${esc(label)}</span><b>不适用</b></div><p>没有可用于此方法的训练输入；不将缺失结果画成零成功率。</p></div>`;
  return `<div class="pv-receiver-result" data-method="${r.method}" data-success="${r.success}" data-n="${r.n}" data-rate="${r.rate}"><div class="pv-metric-head"><span style="color:${color}">${esc(label)}</span><b>${r.success} / ${r.n}</b></div><p>正确率 ${pct(r.rate)} · 95%区间 ${pct(r.ci95_two_sided[0])}–${pct(r.ci95_two_sided[1])}</p><p>负载 BER ${pct(r.payload_ber,3)} · CRC 通过 ${pct(r.crc_pass_rate)}</p><p>BER可评估 ${r.payload_ber_evaluable_sessions}/${r.n} 会话；负载擦除 ${r.payload_erasure_sessions} 会话。</p></div>`;
 }
 function table(records,includeSeries=false){
  const head=['K',includeSeries?'对照组 / 方法':'接收方法','完整包正确','95% 区间','负载 BER','CRC 通过','平均前向调用','平均接收耗时 (ms)'];
  return `<table><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${records.map(r=>`<tr data-k="${r.K}" data-method="${esc(r.method)}"><td>${r.K}</td><td>${esc(r.display_label||labels[r.method]||r.method)}</td><td>${rowValid(r)?`${r.success}/${r.n} · ${pct(r.rate)}`:'不适用'}</td><td>${rowValid(r)?`${pct(r.ci95_two_sided[0])}–${pct(r.ci95_two_sided[1])}`:'—'}</td><td>${pct(r.payload_ber,3)}</td><td>${pct(r.crc_pass_rate)}</td><td>${num(r.forward_calls_mean,1)}</td><td>${num(Number.isFinite(r.seconds_mean)?r.seconds_mean*1000:null,1)}</td></tr>`).join('')}</tbody></table>`;
 }
 function renderBudget(){
  const q={split:'validation',group:'fixed',drift:state.drift,snr_db:state.snr};
  const a=rows({...q,method:'L'}),b=rows({...q,method:state.method}),ra=exact(a,state.K),rb=exact(b,state.K);
  const ss=[series(labels.L,blue,a),series(labels[state.method],orange,b,true)];
  legend('pv-budget-legend',ss);chart('pv-budget-chart',ss,{selected:state.K,selectable:true});
  $('pv-condition-label').textContent=`${drifts[state.drift]} · ${snrLabel(state.snr)} · 同一 K 下共享发送、噪声与观测；每条消息为 4 字节。`;
  const minimum=data.minimum_pilots.find(r=>r.drift===state.drift&&r.snr_db===state.snr);
  const candidate=minimum?.candidate_K;
  const minimumText=Number.isFinite(candidate)?`本条件验证集筛选的固定候选为 K=${candidate}，尚未确认最少可行值。30/30 也不足以确认 99% 可靠性。`:'本条件在已测试固定预算中未找到满足样本比例要求的候选。';
  $('pv-selected').innerHTML=(!ra&&!rb)?`<div class="pv-empty" data-state="not-run"><strong>K=${state.K}：当前条件未计算</strong><p>请点击图中实际计算点。不会借用其他噪声、偏差或预算的结果。</p></div>`:`<h3>当前选中的实测点</h3><div class="pv-selected-k"><strong>K = ${state.K}</strong><span>额外专用训练帧</span></div>${receiverBlock(labels.L,ra,blue)}${receiverBlock(labels[state.method],rb,orange)}<div class="pv-cost"><div><b>${state.K*16}</b><span>专用已知码元</span></div><div><b>${state.K+5}</b><span>训练 + 数据帧</span></div><div><b>${pct(ra?.efficiency_mean,1)}</b><span>负载位 / 发送码元</span></div></div><p class="pv-small">公开长度头另占 1 个已知完整输入；5 个数据帧中已计入长度头与 CRC。</p>`;
  const special=state.method==='E1_header'?'固定长度头也是公开训练信息。因此，K=0 时仍可能恢复消息；这不是“无任何已知输入”。':state.method.startsWith('linear')?'该基线直接学习等效解码关系。没有准确参数估计不代表消息没有泄漏；参数误差在此不适用。':state.method==='E2'?'信息对等控制应与 L 一致。若结果相同，差异来自掌握的信息，而不是“合法”或“未知”身份。':state.method==='ideal'?'真实参数只用于评价上限，不可当成实际接收器性能，也不能作为未知参数方的输入。':'增加公开训练可能同时帮助双方。本图的 E1 是有限搜索预算下的经验恢复能力，不是安全性下界或保密证明。';
  $('pv-method-note').textContent=special+' '+minimumText;
  const specs=[['入射偏振 α','alpha_error_deg','°'],['第二层转角 θ','theta_error_deg','°'],['L₂–L₃ 间距','distance_error_um','μm']];
  $('pv-parameter-table').innerHTML=`<div class="pv-table-scroll"><table><thead><tr><th>参数</th><th>L</th><th>${esc(labels[state.method])}</th></tr></thead><tbody>${specs.map(([name,key,unit])=>`<tr><td>${name} (${unit})</td><td>${small(ra?.parameter_errors?.[key]?.median)}</td><td>${small(rb?.parameter_errors?.[key]?.median)}</td></tr>`).join('')}</tbody></table></div><p class="pv-small">偏振误差按 180°、整层转角按 360° 周期计算。这里是描述性中位数，不是置信区间。</p>`;
  $('pv-information').innerHTML=`<div class="pv-information-line"><strong>L：</strong>${info.L}</div><div class="pv-information-line"><strong>${esc(labels[state.method])}：</strong>${info[state.method]}</div><p class="pv-small">有训练时搜索同时拟合公共复增益。双方只读各自声明的信息；真实参数与原始消息仅供发送、理想参考和独立评价。CRC 可检查候选，但不证明保密性。仅用专用训练的 E1 不代表利用了全部公开信息。</p>`;
  const joined=[...a,...b].sort((a,b)=>a.K-b.K||a.method.localeCompare(b.method));$('pv-budget-table').innerHTML=table(joined);
  currentExport={view:'budget',condition:q,selected_K:state.K,comparison:state.method,records:joined,description:'验证集；每点独立会话统计；同会话不同K和方法不能合并成独立样本'};
  $('pv-budget-chart').dataset.condition=JSON.stringify(q);$('pv-selected').dataset.k=state.K;
 }
 function adaptiveRow(scheme,method){return data.adaptive_comparison.find(r=>r.split==='confirmation'&&r.scheme===scheme&&r.method===method);}
 function renderAdaptive(){
  const schemes=['A','B','C'], names=['固定1帧','固定5帧','按需追加'];
  const ar=schemes.map((s,i)=>({...adaptiveRow(s,'L'),K:i})),er=schemes.map((s,i)=>({...adaptiveRow(s,'E1'),K:i}));
  const ss=[series('L · 预配置接收',blue,ar),series('E1 · 未知准确参数',orange,er)];legend('pv-adaptive-legend',ss);
  chart('pv-adaptive-chart',ss,{categories:names,xTitle:'预先规定的方案',selected:schemes.indexOf(state.scheme)});
  chart('pv-overhead-chart',[series('平均训练帧',teal,ar)],{categories:names,xTitle:'专用训练帧（另有5个数据帧）',yKey:'K_mean',yMax:6,yTitle:'平均 K（帧）',target:false,selected:schemes.indexOf(state.scheme)});
  const r=adaptiveRow(state.scheme,'L'),e=adaptiveRow(state.scheme,'E1');
  if(!r||!e){$('pv-adaptive-detail').innerHTML='<p class="pv-empty">该方案尚未计算。</p>';return;}
  const confirmed=r.lower95_one_sided>=.99;
  $('pv-adaptive-detail').innerHTML=`<h3>${esc(names[schemes.indexOf(state.scheme)])} · 299 个独立确认会话</h3><div class="pv-adaptive-stats"><div><strong>${r.success}/${r.n}</strong><span>L 完整包正确</span></div><div><strong>${e.success}/${e.n}</strong><span>E1 完整包正确</span></div><div><strong>${num(r.K_mean)}</strong><span>平均训练帧 · P95 ${num(r.K_p95,0)}</span></div><div><strong>${pct(r.lower95_one_sided,3)}</strong><span>L 单侧 95% 置信下界</span></div></div><p class="pv-verdict"><strong>${confirmed?'在预定条件下达到 99% 确认目标。':'尚未通过 99% 确认门槛。'}</strong> ${state.scheme==='C'?'E1 同样恢复全部消息，没有观察到保密收益。相对候选固定5帧，平均训练减少48.36%；但固定5帧本身未确认，不能称为两个已达标方案的等可靠性比较。':'样本正确率不等于置信下界；固定最少可行导频数量仍未确认。'}</p><div class="pv-table-scroll pv-confirmation-table"><table><thead><tr><th>开销与成本</th><th>归档结果</th></tr></thead><tbody><tr><td>平均总发送帧（含5帧数据）</td><td>${num(r.total_frames_mean)}</td></tr><tr><td>负载位 / 发送码元</td><td>${pct(r.efficiency_mean,2)}</td></tr><tr><td>平均公开反馈（逻辑位）</td><td>${num(r.feedback_bits_mean)}</td></tr><tr><td>L / E1 最终接收平均前向调用</td><td>${num(r.forward_calls_mean,1)} / ${num(e.forward_calls_mean,1)}</td></tr><tr><td>按需停止检验额外平均调用</td><td>${num(r.adaptive_stop_calls_mean,1)}</td></tr><tr><td>L / E1 最终接收平均时间</td><td>${num(r.seconds_mean*1000,1)} / ${num(e.seconds_mean*1000,1)} ms</td></tr><tr><td>按需停止检验额外平均时间</td><td>${num(r.adaptive_stop_seconds_mean*1000,1)} ms</td></tr><tr><td>L / E1 优化达到调用预算上限</td><td>${r.budget_exhausted_sessions}/${r.n} / ${e.budget_exhausted_sessions}/${e.n}</td></tr></tbody></table></div><p class="pv-small">调用数包含冻结算法记录的搜索与矩阵构造；停止阶段另列，另有双方共享的公开模型预处理。触达优化预算不等于消息接收失败，也不代表找到全局最优。</p>`;
  $('pv-adaptive-detail').dataset.scheme=state.scheme;$('pv-adaptive-detail').dataset.success=r.success;$('pv-adaptive-detail').dataset.lower95=r.lower95_one_sided;
  currentExport={view:'adaptive',condition:{split:'confirmation',drift:'joint',snr_db:60},selected_scheme:state.scheme,records:data.adaptive_comparison.filter(r=>r.split==='confirmation'),description:'方案级汇总；不能对按需停止K分组做不加权平均'};
 }
 function renderExtra(){
  let ss,note,title,query,selectedRecords;
  $('pv-extra-snr-label').hidden=state.extra!=='energy';
  if(state.extra==='cumulative'){
   query={split:'cumulative',group:'cumulative',snr_db:60};
   ss=[series('L · 预配置',blue,rows({...query,method:'L'})),series('E1 · 仅专用导频',orange,rows({...query,method:'E1'}),true),series('线性解码 · 仅专用导频',teal,rows({...query,method:'linear'}))];
   title='同一参数被重复使用时';note='10 个参数复用簇，参考 SNR 60 dB；横轴是累计公开训练总量。16 帧后重复完整输入基，增加噪声平均而不增加秩。每簇更换独立消息和噪声；不与主实验按同一次观测配对，不把多次帧当成更多独立参数簇。E1 此处未额外利用公开长度头。';
  }else{
   const energy=state.extra==='energy',comparison=energy?'fixed_total_energy':'search_budget';
   query={comparison,snr_db:energy?state.extraSnr:60};
   const paired=(data.paired_controls||[]).filter(r=>r.comparison===comparison&&r.snr_db===query.snr_db);
   const labelA=energy?'每码元能量固定':'默认搜索预算',labelB=energy?'总入射能量固定':'提高搜索预算';
   ss=[series(labelA,blue,paired.filter(r=>r.arm==='baseline')),series(labelB,orange,paired.filter(r=>r.arm==='alternative'),true)];
   title=energy?'导频收益是否只是能量增加？':'给未知参数方更多搜索预算';
   note=energy?'只比较同10个会话、相同K的配对记录。固定总入射能量为6个单位，幅度乘 sqrt(6/(5+K))，噪声方差保持不变；没有按接收幅度归一化。单位是输入场范数，不是实测焦耳。图示为 L 接收结果。':'同10个会话、同一观测。默认16中心筛选后2初值×160次目标调用；提高为4初值×320次。包含失败和超预算尝试；有限预算未恢复不能证明无法恢复。这里只比较实际共同计算的K=1、4、16。';
  }
  $('pv-extra-title').textContent=title;$('pv-extra-sample').textContent=state.extra==='cumulative'?'每点 10 个参数簇':'每点 10 个配对会话';
  legend('pv-extra-legend',ss);chart('pv-extra-chart',ss,{xTitle:state.extra==='cumulative'?'累计专用训练帧 K':'额外专用训练帧 K'});$('pv-extra-note').textContent=note;
  selectedRecords=ss.flatMap(s=>s.records.map(r=>({...r,display_label:s.label}))).sort((a,b)=>a.K-b.K);
  $('pv-extra-table').innerHTML=selectedRecords.length?table(selectedRecords,true):'<p class="pv-empty">该条件尚未计算，不使用其他条件替代。</p>';
  currentExport={view:'extra',condition:query,records:selectedRecords,description:note};
 }
 function render(){if(!data)return;if(state.tab==='budget')renderBudget();else if(state.tab==='adaptive')renderAdaptive();else renderExtra();}
 function changeTab(tab){state.tab=tab;root.querySelectorAll('[data-pv-tab]').forEach(b=>{const active=b.dataset.pvTab===tab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;$('pv-panel-'+b.dataset.pvTab).hidden=!active;});render();}
 async function load(){
  if(data||loading)return;loading=true;$('pv-loading').hidden=false;$('pv-error').hidden=true;
  try{
   const response=await fetch(new URL('research/public-pilots/visual-data.json',document.baseURI));if(!response.ok)throw Error('HTTP '+response.status);
   const value=await response.json();if(value.schema!=='trikey.public-pilot.visual.v1'||!Array.isArray(value.by_condition)||!value.by_condition.length)throw Error('Unexpected data schema');
   data=value;$('pv-content').hidden=false;$('pv-provenance').textContent=`数据来源：冻结研究统计 · 模型 ${data.physics.model_version} · 算法 ${data.provenance.algorithm_version} · 原统计 SHA256 ${data.provenance.summary_sha256}。记录日期 ${data.generated_at.slice(0,10)}；本页没有新增求解。`;
   render();
  }catch(e){$('pv-error').hidden=false;$('pv-error').dataset.error=e.message;}
  finally{loading=false;$('pv-loading').hidden=true;}
 }
 $('pv-retry').addEventListener('click',load);
 [['pv-drift','drift'],['pv-method','method'],['pv-snr','snr'],['pv-k','K'],['pv-extra-kind','extra'],['pv-extra-snr','extraSnr']].forEach(([id,key])=>$(id).addEventListener('change',e=>{let v=e.target.value;state[key]=key==='snr'?(v==='none'?null:Number(v)):['K','extraSnr'].includes(key)?Number(v):v;render();}));
 root.addEventListener('click',e=>{
  const tab=e.target.closest('[data-pv-tab]');if(tab){changeTab(tab.dataset.pvTab);return;}
  const point=e.target.closest('[data-pilot-k]');if(point){state.K=Number(point.dataset.pilotK);$('pv-k').value=state.K;renderBudget();return;}
  const scheme=e.target.closest('[data-pv-scheme]');if(scheme){state.scheme=scheme.dataset.pvScheme;root.querySelectorAll('[data-pv-scheme]').forEach(b=>b.setAttribute('aria-pressed',b===scheme));renderAdaptive();return;}
  const preset=e.target.closest('[data-pv-preset]');if(preset){const kind=preset.dataset.pvPreset;Object.assign(state,{drift:'joint',snr:60,K:kind==='header'?0:kind==='linear'?16:1,method:kind==='header'?'E1_header':kind==='linear'?'linear_header':'E1'});$('pv-drift').value=state.drift;$('pv-snr').value='60';$('pv-method').value=state.method;$('pv-k').value=state.K;renderBudget();}
 });
 root.addEventListener('keydown',e=>{
  const point=e.target.closest('[data-pilot-k]');if(point&&['Enter',' '].includes(e.key)){e.preventDefault();const k=point.dataset.pilotK;point.dispatchEvent(new MouseEvent('click',{bubbles:true}));root.querySelector(`[data-pilot-k="${k}"]`)?.focus();}
  const tab=e.target.closest('[data-pv-tab]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...root.querySelectorAll('[data-pv-tab]')],i=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;changeTab(tabs[next].dataset.pvTab);tabs[next].focus();}
 });
 function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('pv-export-status').textContent='已导出：'+name;}
 $('pv-export-json').addEventListener('click',()=>{if(currentExport)download(JSON.stringify({schema:'trikey.pilot-view-export.v1',mode:'precomputed_results',provenance:data.provenance,definitions:data.definitions,...currentExport},null,2),'application/json','Trikey_公开导频_'+state.tab+'.json');});
 $('pv-export-svg').addEventListener('click',()=>{
  const id=state.tab==='budget'?'pv-budget-chart':state.tab==='adaptive'?'pv-adaptive-chart':'pv-extra-chart',svg=$(id).querySelector('svg');if(!svg){$('pv-export-status').textContent='该条件没有可导出的图表。';return;}
  const copy=svg.cloneNode(true);copy.setAttribute('xmlns',NS);const vb=copy.viewBox.baseVal,oldHeight=vb.height;copy.setAttribute('viewBox',`0 0 ${vb.width} ${oldHeight+112}`);
  const meta=element('metadata',{},JSON.stringify({provenance:data.provenance,view:currentExport.condition,mode:'precomputed_results'}));copy.prepend(meta);
  const background=element('rect',{width:'100%',height:'100%',fill:'white'});copy.insertBefore(background,copy.firstChild);
  const style=element('style',{},'text{font-family:Arial,sans-serif;font-size:12px;fill:#53677f}.pv-grid{stroke:#e5ebf3;stroke-width:1}.pv-point{stroke-width:2}');copy.append(style);
  const legends=[...$(state.tab==='budget'?'pv-budget-legend':state.tab==='adaptive'?'pv-adaptive-legend':'pv-extra-legend').querySelectorAll('span')].map(n=>n.textContent);
  legends.forEach((label,i)=>copy.append(element('text',{x:44,y:oldHeight+18+i*16},label)));
  copy.append(element('text',{x:44,y:oldHeight+78},state.tab==='budget'?`${drifts[state.drift]} · ${snrLabel(state.snr)} · 验证集` :state.tab==='adaptive'?'联合偏差 · 参考SNR60dB · 独立确认299会话':$('pv-extra-title').textContent));
  copy.append(element('text',{x:44,y:oldHeight+98},'归档统计；95%双侧区间。来源 SHA: '+data.provenance.summary_sha256.slice(0,12)));
  download(new XMLSerializer().serializeToString(copy),'image/svg+xml','Trikey_公开导频_'+state.tab+'.svg');
 });
 document.addEventListener('material-view',e=>{if(e.detail==='pilots'){load();if(data)requestAnimationFrame(render);}});
 addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!root.hidden)render();},120);});
 if(document.body.dataset.view==='pilots')load();
})();
