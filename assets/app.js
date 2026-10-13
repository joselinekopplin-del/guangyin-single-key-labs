'use strict';
const $=id=>document.getElementById(id),mode=document.body.dataset.mode,C=LabConfig,c=C.labs[mode];
const keyInfo={0:{pol:0,angle:0,z:.006,symbol:'0'},1:{pol:0,angle:0,z:.010,symbol:'1'},2:{pol:0,angle:90,z:.006,symbol:'2'},4:{pol:0,angle:180,z:.006,symbol:'4'},6:{pol:0,angle:270,z:.006,symbol:'6'},8:{pol:1,angle:0,z:.006,symbol:'8'}};
const state={mode,keyIndex:0,value:mode==='spacing'?6:0,result:null,communication:null,scan:null,ready:false,busy:false,revision:0};
window.labState=state;
let worker,pending=new Map(),requestID=0,renderTimer,toastTimer;
const pretty=v=>mode==='spacing'?Number(v).toFixed(1)+' mm':Number(v).toFixed(0)+'°';
const referenceValue=()=>C.keyValue(mode,keyInfo[state.keyIndex]);
function toast(text){$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4500);}
function status(text){$('status').textContent='● '+text;}
function initWorker(){
  worker=new Worker('../assets/worker.js');
  worker.onmessage=({data:m})=>{const q=pending.get(m.id);if(!q)return;if(m.error){pending.delete(m.id);q.reject(Error(m.error));}else if('result' in m){pending.delete(m.id);q.resolve(m.result);}else q.progress?.(m);};
  worker.onerror=e=>{const message=location.protocol==='file:'?'请通过本地服务器或 GitHub Pages 打开，以启用光场计算。':'计算线程加载失败，请刷新页面重试。';for(const p of pending.values())p.reject(Error(message));pending.clear();status(message);toast(message);};
}
function compute(type,extra={},progress){return new Promise((resolve,reject)=>{const id=++requestID;pending.set(id,{resolve,reject,progress});worker.postMessage({id,type,mode,value:state.value,keyIndex:state.keyIndex,...extra});});}
function heat(id,values){
  const canvas=$(id),ctx=canvas.getContext('2d'),im=ctx.createImageData(64,64),peak=Math.max(...values,1e-30);
  const stops=[[8,27,48],[17,73,110],[39,136,168],[125,194,202],[244,232,165]];
  for(let i=0;i<4096;i++){const u=Math.max(0,Math.min(1,values[i]/peak))*4,k=Math.min(3,Math.floor(u)),t=u-k;for(let j=0;j<3;j++)im.data[4*i+j]=Math.round(stops[k][j]*(1-t)+stops[k+1][j]*t);im.data[4*i+3]=255;}
  ctx.putImageData(im,0,0);
}
function scene(){
  const p=C.options(mode,state.value),accent=getComputedStyle(document.body).getPropertyValue('--accent');
  $('pol-needle').setAttribute('transform',`rotate(${-p.polError})`);
  $('pol-scene-label').textContent=mode==='polarization'?pretty(state.value):'H · 0°';
  $('layer2').setAttribute('transform',`translate(645 73) rotate(${-p.angle})`);
  $('rotation-scene-label').textContent='L₂ · '+p.angle+'°';
  const x=mode==='spacing'?775+(state.value-4)*16:858;
  $('layer3-group').setAttribute('transform',`translate(${x} 0)`);
  const beams=$('scene').querySelectorAll('.beam');beams[0].setAttribute('d',`M100 73H${x+119}`);beams[1].setAttribute('d',`M240 52L425 35L645 35L${x} 35L${x+119} 54M240 94L425 111L645 111L${x} 111L${x+119} 92`);
  $('spacing-scene-label').setAttribute('x',(645+x)/2);$('spacing-scene-label').textContent=p.z.toFixed(1)+' mm';
  $('spacing-line').setAttribute('d',`M683 153H${x-37}`);
  const el=mode==='polarization'?'pol-disc':mode==='rotation'?'layer2':'spacing-line';$(el).style.color=accent;
  const text=mode==='polarization'?'pol-scene-label':mode==='rotation'?'rotation-scene-label':'spacing-scene-label';$(text).classList.add('active-label');
  document.querySelectorAll('[data-preset]').forEach(b=>{const active=Number(b.dataset.preset)===state.value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function invalidate(){
  state.revision++;state.ready=false;state.communication=null;$('export').disabled=true;
  $('crc').textContent='参数已更新';$('crc').className='badge';$('ber').textContent='误码率 BER —';
  $('decoded').textContent='请重新传输，查看当前接收参数的恢复结果。';$('comm-note').textContent='单帧最多 122 个 UTF-8 字节；发射密钥与当前接收参数分别建模。';
}
function setValue(v){
  if(!Number.isFinite(v)||v<c.min||v>c.max){toast(`请输入 ${c.min}–${c.max} ${c.unit} 范围内的数值。`);$('value').value=state.value;return;}
  state.value=Math.round(v/c.step)*c.step;state.value=Number(state.value.toFixed(3));$('value').value=state.value;$('slider').value=state.value;
  invalidate();scene();status('参数已更新，正在重新传播光场…');clearTimeout(renderTimer);renderTimer=setTimeout(render,100);
}
async function render(){
  const revision=state.revision;const start=performance.now();
  try{const r=await compute('render');if(revision!==state.revision)return;
    state.result=r;state.ready=true;heat('target',r.target);heat('current',r.current);heat('wrong-image',r.wrong);
    $('target-caption').textContent=`字符 ${keyInfo[state.keyIndex].symbol} · ${pretty(referenceValue())}`;
    $('current-caption').textContent=pretty(state.value)+' · 当前参数';
    $('wrong-image-caption').textContent=`${pretty(C.wrongValue(mode,referenceValue()))} · NCC ${r.wrongMetrics.ncc.toFixed(3)}`;
    $('ncc').textContent=r.metrics.ncc.toFixed(4);$('psnr').textContent=r.metrics.psnr.toFixed(2);$('efficiency').textContent=(r.metrics.efficiency*100).toFixed(1)+'%';
    const best=[...r.similarity].sort((a,b)=>b.ncc-a.ncc)[0];
    $('observation').textContent=`当前最接近字符「${best.symbol}」（NCC ${best.ncc.toFixed(3)}），与目标「${keyInfo[state.keyIndex].symbol}」的 NCC 为 ${r.metrics.ncc.toFixed(3)}。${mode==='polarization'?'中间偏振方向可同时激发两个通道。':'错钥也可能重建其他训练字符。'}`;
    status(`计算完成 · 128 × 128 角谱传播 · ${(performance.now()-start).toFixed(0)} ms`);$('export').disabled=false;
    drawPlot(state.scan?.rows||[]);
  }catch(e){status(e.message);toast(e.message);}
}
function lock(busy){state.busy=busy;document.querySelectorAll('[data-lock]').forEach(x=>x.disabled=busy);$('export').disabled=busy||!state.ready;$('scan-export').disabled=busy||!state.scan;}
function inputSnapshot(){return {mode,keyIndex:state.keyIndex,value:state.value,reference:referenceValue(),message:$('message').value,snr:Number($('snr').value)};}
async function communicate(){
  const text=$('message').value,bytes=new TextEncoder().encode(text).length;
  if(!text.trim()){toast('请先输入要传输的文字。');return;}
  if(bytes>122){toast(`当前 ${bytes} 字节，单帧上限为 122 字节，请缩短文字。`);return;}
  clearTimeout(renderTimer);lock(true);$('send').textContent='恢复中…';$('crc').textContent='计算复场传播';$('crc').className='badge';$('decoded').textContent='正在从模拟接收光场求解码元…';
  const snapshot=inputSnapshot();
  try{const result=await compute('communicate',{text,snr:snapshot.snr},m=>{$('crc').textContent=`数字恢复 ${Math.round(m.progress*100)}%`;});
    state.communication={...result,snapshot};$('crc').textContent=result.crcValid?'CRC PASS · 校验通过':'CRC FAIL · 校验失败';$('crc').className='badge'+(result.crcValid?'':' fail');
    $('ber').textContent=`BER ${(100*result.ber).toFixed(2)}% · ${result.errors}/${result.packetBits} bit`;
    $('decoded').textContent=result.decoded||'未恢复出可显示的文字';
    $('comm-note').textContent=`发射 ${pretty(snapshot.reference)} → 接收 ${pretty(snapshot.value)} · ${result.payloadBytes} 字节 · ${snapshot.snr} dB。${result.crcValid?'从接收数据实际解码；通过校验不代表密钥唯一或系统安全。':'显示的是实际解码结果，内容不可信；没有用“密钥相等”替代解码。'}`;
    status('信息恢复完成 · 复场测量 + 数字逆问题求解');
  }catch(e){$('crc').textContent='运行失败';$('decoded').textContent=e.message;toast(e.message);}
  finally{$('send').textContent='传输并恢复 →';lock(false);if(!state.ready)render();}
}
function plotSurface(){const canvas=$('plot'),dpr=window.devicePixelRatio||1,w=Math.max(230,canvas.clientWidth),h=240;canvas.width=Math.round(w*dpr);canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h};}
function drawPlot(rows=[]){
  const {ctx,w,h}=plotSurface(),pad={l:45,r:15,t:25,b:48},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
  const x=v=>pad.l+(v-c.min)/(c.max-c.min)*pw,y=v=>pad.t+(1-v)*ph/1.2;
  const accent=getComputedStyle(document.body).getPropertyValue('--accent').trim();ctx.clearRect(0,0,w,h);ctx.font='15px "Times New Roman", "SimSun", serif';ctx.fillStyle='#67736a';ctx.strokeStyle='#d8d9cb';ctx.lineWidth=1;
  for(const v of [0,.5,1]){ctx.beginPath();ctx.moveTo(pad.l,y(v));ctx.lineTo(w-pad.r,y(v));ctx.stroke();ctx.textAlign='right';ctx.fillText(v.toFixed(1),pad.l-10,y(v)+5);}
  for(let i=0;i<=4;i++){let v=c.min+(c.max-c.min)*i/4;ctx.textAlign='center';ctx.fillText(v.toFixed(0),x(v),h-25);}
  ctx.textAlign='left';ctx.fillText('NCC',pad.l,15);ctx.textAlign='right';ctx.fillText(c.unit==='°'?'angle / °':'distance / mm',w-pad.r,h-3);
  const ref=referenceValue();ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle=accent;ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(x(ref),pad.t);ctx.lineTo(x(ref),h-pad.b);ctx.stroke();ctx.restore();
  if(rows.length){ctx.beginPath();rows.forEach((r,i)=>i?ctx.lineTo(x(r.value),y(r.ncc)):ctx.moveTo(x(r.value),y(r.ncc)));ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();rows.forEach(r=>{ctx.beginPath();ctx.arc(x(r.value),y(r.ncc),2.3,0,2*Math.PI);ctx.fillStyle=accent;ctx.fill();});}
  else{ctx.textAlign='center';ctx.fillStyle='#67736a';ctx.font='17px "Times New Roman", "SimSun", serif';ctx.fillText('运行扫描，生成实算曲线',pad.l+pw/2,105);}
  $('plot').setAttribute('aria-label',rows.length?`${c.short}扫描，共 ${rows.length} 个点；最高 NCC ${Math.max(...rows.map(r=>r.ncc)).toFixed(4)}。`:'尚未扫描。横轴为密钥参数，纵轴为图像相关系数。');
}
async function scan(){
  clearTimeout(renderTimer);lock(true);state.scan=null;$('scan').textContent='扫描中…';$('scan-state').textContent='开始计算';
  try{state.scan=await compute('scan',{},m=>{drawPlot(m.rows);$('scan-state').textContent=`已计算 ${m.rows.length} 点`});drawPlot(state.scan.rows);$('scan-state').textContent=`完成 · ${state.scan.rows.length} 点`;status('扫描完成 · 可下载原始数值');}
  catch(e){toast(e.message);$('scan-state').textContent='扫描失败';}
  finally{$('scan').textContent='重新扫描';lock(false);if(!state.ready)render();}
}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function save(){if(!state.ready)return;download(`光隐-${mode}-实验.json`,JSON.stringify({created:new Date().toISOString(),model:'PRISM trained weights 20260914; single-variable study 20260920',...inputSnapshot(),parameters:C.options(mode,state.value),result:state.result,communication:state.communication,scan:state.scan,units:{angle:'degree',z:'mm',wavelength:'nm'},note:'Numerical simulation. Coherent reception assumed. Not a cryptographic security claim.'},null,2),'application/json');toast('实验记录已导出，包含输入文字（如已传输）。');}
function saveScan(){if(!state.scan)return;const header='mode,target_symbol,reference_value,parameter_value,unit,pol,pol_angle_deg,layer2_angle_deg,d23_mm,ncc,psnr_db,target_energy_fraction';const rows=state.scan.rows.map(r=>{const p=C.options(mode,r.value);return [mode,keyInfo[state.scan.keyIndex].symbol,state.scan.referenceValue,r.value,c.unit,p.pol,p.polError,p.angle,p.z,r.ncc,r.psnr,r.efficiency].join(',');});download(`光隐-${mode}-扫描.csv`,'\uFEFF'+[header,...rows].join('\r\n'),'text/csv;charset=utf-8');}
for(const i of c.keys){const k=keyInfo[i],option=document.createElement('option');option.value=i;option.textContent=`字符 ${k.symbol} / ${pretty(C.keyValue(mode,k))}`;$('reference').append(option);}
$('reference').addEventListener('change',()=>{state.keyIndex=Number($('reference').value);state.scan=null;$('scan-export').disabled=true;$('scan-state').textContent='目标已改变，请重新扫描';setValue(referenceValue());drawPlot();});
$('value').addEventListener('change',()=>setValue($('value').value===''?NaN:Number($('value').value)));
$('slider').addEventListener('input',()=>setValue(Number($('slider').value)));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>setValue(Number(b.dataset.preset))));
$('match').addEventListener('click',()=>setValue(referenceValue()));$('wrong').addEventListener('click',()=>setValue(C.wrongValue(mode,referenceValue())));
$('send').addEventListener('click',communicate);$('scan').addEventListener('click',scan);$('export').addEventListener('click',save);$('scan-export').addEventListener('click',saveScan);
function invalidateMessage(){state.communication=null;$('crc').textContent='信息设置已更新';$('crc').className='badge';$('ber').textContent='误码率 BER —';$('decoded').textContent='请重新传输，以更新接收结果。';$('comm-note').textContent='单帧最多 122 个 UTF-8 字节。';}
$('message').addEventListener('input',invalidateMessage);$('snr').addEventListener('change',invalidateMessage);
new ResizeObserver(()=>drawPlot(state.scan?.rows||[])).observe($('plot').parentElement);
try{initWorker();scene();drawPlot();render();}catch(e){status('启动失败：'+e.message);toast(e.message);}
