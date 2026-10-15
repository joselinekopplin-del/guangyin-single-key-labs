/* Guided operations reuse the existing measured frame and numerical receiver. */
(function(){
'use strict';
state.guidedRunning=false;state.guideRows=[];
let activeFrame=null;
function refresh(){
 const frame=state.frame,id=frame?.frameID||null;
 if(id!==activeFrame){activeFrame=id;state.guideRows=[];drawRows();if(!state.guidedRunning)$('guide-status').textContent=id?'新的通信密文已生成，可以继续做三个场景的同帧对照。':'发射设置已更新，下次运行场景会生成新的密文。';}
 const bytes=new TextEncoder().encode($('message').value).length,valid=bytes>0&&bytes<=122&&!!$('message').value.trim();
 $('payload-meter').textContent=`${bytes} / 122 UTF-8 字节${bytes>122?' · 已超出，请缩短文字':' · 中文和英文占用的字节数不同'}`;
 $('payload-meter').classList.toggle('invalid',!valid);
 $('encrypt').disabled=state.busy||state.guidedRunning||!valid;
 document.querySelectorAll('[data-scenario]').forEach(b=>b.disabled=state.busy||state.guidedRunning||!state.ready||!valid);
 $('quick-demo').disabled=state.busy||state.guidedRunning||!state.ready||!valid;
 $('guide-csv').disabled=state.busy||state.guidedRunning||!state.guideRows.length;
 $('export').disabled=state.busy||state.guidedRunning||!state.ready;
 let title='准备传输',detail='输入短文字后生成密文，再用三个接收参数恢复。',tone='neutral';
 if(frame){title='本次密文已固定';detail='更改接收参数只会改变恢复结果，不会重新生成密文。';}
 if(state.decoded){const r=state.decoded;title=r.crcValid?'本帧通过完整性检查':'本帧未通过完整性检查';tone=r.crcValid?'success':'attention';detail=`本帧 ${r.packetBits} 个统计位中，${r.errors} 位出错（BER ${(r.ber*100).toFixed(2)}%）。`+(r.crcValid?'这是本次接收结果，不代表密码安全认证。':'可重新匹配三个参数，或用公开导频尝试校准。');}
 if(!state.decoded)$('crc').className='badge';
 $('receive-title').textContent=title;$('receive-detail').textContent=detail;$('receive-insight').dataset.tone=tone;
}
const previousAvailability=availability;availability=function(){previousAvailability();if(state.guidedRunning)document.querySelectorAll('[data-lock]').forEach(e=>e.disabled=true);refresh();};
function drawRows(){
 const body=$('guide-rows');body.replaceChildren();
 for(const row of state.guideRows){const tr=document.createElement('tr');for(const v of [row.name,J.keyText(row.rx),(row.ber*100).toFixed(2)+'%',row.crcValid?'PASS':'FAIL']){const td=document.createElement('td');td.textContent=v;tr.append(td);}body.append(tr);}
 if(!state.guideRows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='尚无对照记录';tr.append(td);body.append(tr);}
 $('guide-count').textContent=state.guideRows.length+' 项';$('guide-frame').textContent=activeFrame?'同一密文 SHA-256 前 12 位 '+activeFrame.slice(0,12):'运行场景后保留本次计算结果。';
}
function record(code,name){
 if(!state.decoded||state.decoded.frameID!==state.frame?.frameID)throw Error('尚未获得本帧的接收结果。');
 const row={code,name,frameID:state.frame.frameID,rx:{...state.rx},ber:state.decoded.ber,crcValid:state.decoded.crcValid,packetBits:state.decoded.packetBits,snr:state.frame.snr,phaseError:state.phaseError};
 state.guideRows=state.guideRows.filter(r=>r.code!==code);state.guideRows.push(row);drawRows();
}
async function receive(rx){setRx(rx);clearTimeout(timer);await render();if(!state.ready)throw Error('光场计算未完成，请刷新后重试。');await decrypt();if(!state.decoded)throw Error('未能完成本帧接收，请重试。');}
async function guide(mode,fresh=false){
 if(state.busy||state.guidedRunning||!state.ready)return;
 state.guidedRunning=true;availability();
 try{
  if(fresh||!state.frame){$('guide-status').textContent='正在生成一次通信密文与公开导频…';await encrypt();if(!state.frame)throw Error('未生成密文，请检查文字长度或稍后重试。');}
  const frameID=state.frame.frameID,tx=J.channel(D,state.index);
  if(mode==='correct'){$('guide-status').textContent='匹配三个接收参数，并恢复当前密文…';await receive(tx);record('correct','正确参数');}
  else if(mode==='wrong'){$('guide-status').textContent='更换三个接收参数，用同一密文实际恢复…';await receive(J.altered(tx,7));record('wrong','三项错钥');}
  else if(mode==='calibrate'){
   $('guide-status').textContent='加入同步漂移，先记录未校准的接收结果…';await receive(J.key(tx.polError+1.5,tx.angle+1,tx.z+.1));record('drift-before','漂移 · 未校准');
   $('guide-status').textContent='使用公开导频联合校准，再接收同一密文…';await calibrate();if(!state.calibration)throw Error('校准未完成，请检查研究工具中的搜索窗口。');
   const estimate={...state.calibration.estimated};setRx(estimate,true);clearTimeout(timer);await render();await decrypt();record('drift-after','漂移 · 已校准');
  }
  if(state.frame.frameID!==frameID)throw Error('密文发生变化，请重新运行对照。');
  $('guide-status').textContent=`本场景完成 · 密文 ${frameID.slice(0,12)} · 记录保留实际 BER 与 CRC`;
  $('guide-details').open=true;
 }catch(e){$('guide-status').textContent='场景未完成：'+e.message;toast(e.message);}finally{state.guidedRunning=false;availability();}
}
document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>guide(b.dataset.scenario));$('quick-demo').onclick=()=>guide('correct',true);
$('guide-csv').onclick=()=>{if(!state.guideRows.length)return;const escape=v=>'"'+String(v).replace(/"/g,'""')+'"';download('本帧接收对照.csv','\uFEFFcondition,alpha_deg,theta_deg,distance_mm,ber,crc_pass,frame_sha256,snr_db,phase_error_rad\r\n'+state.guideRows.map(r=>[r.name,r.rx.polError,r.rx.angle,r.rx.z,r.ber,r.crcValid,r.frameID,r.snr,r.phaseError].map(escape).join(',')).join('\r\n'),'text/csv;charset=utf-8');};

const cards=[...document.querySelectorAll('.paper')],search=$('paper-search'),topic=$('paper-topic'),access=$('paper-access');
const normalize=t=>t.normalize('NFKC').toLocaleLowerCase();
const searchable=new Map(cards.map(p=>[p,normalize(p.textContent)]));
function filter(){
 const words=normalize(search.value.trim()).split(/\s+/).filter(Boolean);let count=0;
 for(const card of cards){const visible=(topic.value==='all'||card.dataset.paperGroup===topic.value)&&(access.value==='all'||(access.value==='open'?card.dataset.paperAccess!=='publisher':card.dataset.paperAccess==='publisher'))&&words.every(w=>searchable.get(card).includes(w));card.hidden=!visible;if(visible)count++;}
 document.querySelectorAll('.literature-group').forEach(g=>{const all=[...g.querySelectorAll('.paper')],visible=all.filter(p=>!p.hidden).length;g.hidden=!visible;g.querySelector('.literature-heading > span').textContent=visible===all.length?all.length+' 篇':visible+' / '+all.length+' 篇';});
 $('paper-results').textContent=count===cards.length?'显示全部 '+cards.length+' 篇论文':`找到 ${count} / ${cards.length} 篇论文`;$('paper-empty').hidden=count!==0;
}
function resetFilters(){search.value='';topic.value='all';access.value='all';filter();}
search.addEventListener('input',filter);topic.addEventListener('change',filter);access.addEventListener('change',filter);$('paper-reset').onclick=()=>{resetFilters();search.focus();};
document.querySelectorAll('.literature-nav a,.literature-summary a').forEach(a=>a.addEventListener('click',resetFilters));
const dialog=$('citation-dialog');
document.querySelectorAll('[data-citation]').forEach(b=>b.onclick=()=>{$('citation-title').textContent=b.dataset.citeTitle;$('citation-text').value=b.dataset.citation;$('citation-status').textContent='';dialog.showModal();});
$('citation-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
$('citation-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('citation-text').value);$('citation-status').textContent='已复制引用';}catch{$('citation-text').focus();$('citation-text').select();$('citation-status').textContent='请按 Ctrl+C，或使用设备的复制功能。';}};
$('references-download').onclick=()=>download('光隐论文引用清单.txt',cards.map((p,i)=>`[${String(i+1).padStart(2,'0')}] ${p.querySelector('[data-citation]').dataset.citation}`).join('\r\n\r\n'),'text/plain;charset=utf-8');
function followHash(){const id=location.hash.slice(1),node=document.getElementById(id);if(!node)return;if(/^papers?-/.test(id)){resetFilters();if($('research').hidden)document.querySelector('[data-workspace="research"]').click();history.replaceState(null,'','#'+id);requestAnimationFrame(()=>node.scrollIntoView());}else if(['experiment','extensions','research'].includes(id)&&node.hidden)document.querySelector(`[data-workspace="${id}"]`).click();}
window.addEventListener('hashchange',followHash);document.querySelector('.skip').addEventListener('click',()=>{if($('experiment').hidden)document.querySelector('[data-workspace="experiment"]').click();});
filter();availability();
})();
