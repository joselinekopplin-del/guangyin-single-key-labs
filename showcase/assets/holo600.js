import * as THREE from './vendor/three/three.module.js';
import {OrbitControls} from './vendor/three/addons/controls/OrbitControls.js';

const $=id=>document.getElementById(id),root=$('view-holo600');
let info,indices,ready=false,loading=false,viewer=null,local=null,layerGroups=[],localMesh,selectedPatch=[],pendingTimer,running=false,revision=0,lastResult=null,autofollow=false;
let archiveMode=false,archiveCases=[],archiveInfo=null,activeCaseId=null;
const PUBLIC_ROOT='research/holo600/';
const history=[];
if($('h6-validation')){const auditLink=document.createElement('a');auditLink.href='assets/holo600-validation.json';auditLink.textContent='查看完整采样审计';auditLink.target='_blank';auditLink.rel='noopener';auditLink.style.marginLeft='8px';$('h6-validation').append(auditLink);}
const key=()=>({alpha_deg:Number($('h6-alpha-number').value),theta_deg:Number($('h6-theta-number').value),d23_m:Number($('h6-distance-number').value)/1000});
const keyText=k=>`α=${k.alpha_deg.toFixed(1)}° · θ₂=${k.theta_deg.toFixed(1)}° · d₂₃=${(k.d23_m*1000).toFixed(2)} mm`;
const number=(x,p=4)=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(p):'—';
function status(text,state='idle'){$('h6-status').textContent=text;$('h6-status').parentElement.dataset.state=state;}
function fail(text){$('h6-error').hidden=false;$('h6-error').textContent=text;}
function markStale(){if(archiveMode)return;revision++;$('h6-results').dataset.stale='true';$('h6-result-key').textContent=lastResult?'参数已变，旧结果待更新':'尚无计算结果';status('参数已更改，当前光场尚未更新');$('h6-key').textContent=keyText(key());syncGeometry();clearTimeout(pendingTimer);if($('h6-auto').checked)pendingTimer=setTimeout(calculate,650);}
function validKey(){const k=key();return ['alpha','theta','distance'].every(n=>$('h6-'+n+'-number').value.trim()!=='')&&Object.values(k).every(Number.isFinite)&&k.alpha_deg>=0&&k.alpha_deg<=180&&k.theta_deg>=0&&k.theta_deg<=360&&k.d23_m>=.006&&k.d23_m<=.01;}
async function fetchJSON(url,options){const res=await fetch(url,options);let value;try{value=await res.json();}catch(e){throw Error(archiveMode?'公开归档数据未能读取，请刷新后重试；不会以其他图片代替。':'本机计算服务未能返回数据，请通过“启动600全息展示.cmd”重新打开。');}if(!res.ok)throw Error(value.error||`数据读取失败（HTTP ${res.status}）`);return value;}
function sameKey(a,b){return ['alpha_deg','theta_deg','d23_m'].every(n=>Math.abs(a[n]-b[n])<1e-12);}
function configureArchive(){
 $('h6-static-panel').hidden=false;$('h6-calculate').hidden=true;$('h6-auto').checked=false;$('h6-auto').disabled=true;$('h6-auto').parentElement.hidden=true;
 for(const name of['alpha','theta','distance'])for(const suffix of['','-number'])$('h6-'+name+suffix).disabled=true;
 $('h6-reference').disabled=true;$('h6-reference-label').textContent='已保存的理想相移测量（仅归档条件可用）';
 $('h6-intro').textContent='旋转查看三层真实结构，切换已计算条件，比较光场与图像质量。';
 $('h6-history-heading').textContent='本次查看的归档条件';$('h6-history-note').textContent='下表只记录本次选择的已保存结果；没有在此页面重新运行传播，也不人为规定错钥必失败。';
 $('h6-case-select').replaceChildren();
 for(const row of archiveCases){const op=document.createElement('option');op.value=row.id;op.textContent=row.label?.includes('α')?row.label:(row.label?row.label+' · ':'')+keyText(row.keys);$('h6-case-select').append(op);}
 const plots=[...(info.scan_plot_urls||[]),...(info.geometry_plot_urls||[])];$('h6-scan-panel').hidden=!plots.length;$('h6-scan-plots').replaceChildren();
 const titles={'matched_wrong_comparison.png':'设计参数与错参数的输出对比','key_sensitivity.png':'单参数扫描：NCC 与 PSNR','two_parameter_quality.png':'双参数质量分布'};
 for(const row of plots){const filename=row.url.split('/').pop(),match=filename.match(/^layer([123])_([LW])\.png$/),title=titles[filename]||(match?`第 ${match[1]} 层 · ${match[2]} 尺寸分布`:row.title);const details=document.createElement('details'),summary=document.createElement('summary'),figure=document.createElement('figure'),a=document.createElement('a'),img=document.createElement('img'),cap=document.createElement('figcaption');summary.textContent=title;a.href=row.url;a.target='_blank';a.rel='noopener';img.src=row.url;img.loading='lazy';img.alt=row.title;cap.textContent=row.caption||row.title||'来自已保存计算结果；点击图像查看原尺寸。';a.append(img);figure.append(a,cap);details.append(summary,figure);$('h6-scan-plots').append(details);}
 $('h6-public-downloads').replaceChildren();for(const row of info.public_downloads||[]){const a=document.createElement('a');a.href=row.url;a.textContent=row.label||row.title;a.download='';$('h6-public-downloads').append(a);}
}
async function chooseArchive(id){
 const row=archiveCases.find(c=>c.id===id);if(!row){status('该条件没有归档结果，不显示替代图像。','error');return;}
 const generation=++revision;activeCaseId=id;root.dataset.selectedArchive=id;$('h6-case-select').value=id;setKey(row.keys,false);syncGeometry();$('h6-key').textContent=keyText(row.keys);$('h6-results').dataset.stale='true';$('h6-result-key').textContent='正在读取所选归档';status('读取已保存结果，不运行光学计算…','running');$('h6-error').hidden=true;
 const idx=archiveCases.indexOf(row);$('h6-case-prev').disabled=idx===0;$('h6-case-next').disabled=idx===archiveCases.length-1;
 try{
  const result=await fetchJSON(row.result_url);
  if(generation!==revision)return;
  if(result.design_sha256!==info.design_sha256||!sameKey(result.keys,row.keys)||!result.precomputed)throw Error('结果版本、参数或回放标记与选项不一致，已停止显示。');
  $('h6-reference').checked=!!result.reference_enabled;showResult(result,true);
  const date=result.created_at||result.generated_at||row.created_at||'未记录';
  $('h6-cases-status').textContent=`已计算条件 ${idx+1} / ${archiveCases.length} · 生成：${date} · ${info.model_version}`;
  status(`预计算结果回放 · ${keyText(result.keys)} · 本次未重新求解`,'complete');
 }catch(e){if(generation===revision){fail(e.message);status('归档读取失败：'+e.message,'error');$('h6-results').dataset.stale='true';}}
}
async function initialize(){
 if(ready||loading)return;loading=true;
 try{
  // 已知本机入口才访问API；GitHub Pages和普通静态预览不探测不存在的/api。
  const endpoint=location.port==='4193'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URL(location.href).searchParams.get('holo600_mode')!=='archive';
  archiveMode=!endpoint;root.dataset.runtime=archiveMode?'precomputed':'live';
  if(endpoint){const health=await fetchJSON('/api/holo600/health');if(health.schema!=='trikey.holo600.health.v1')throw Error('本机端口不是600计算服务。');}
  info=await fetchJSON(archiveMode?PUBLIC_ROOT+'info.json':'/api/holo600/info');if(info.n!==600||info.layers!==3)throw Error('数据未提供3×600×600结构。');
  if(archiveMode){archiveInfo=await fetchJSON(info.cases_url||PUBLIC_ROOT+'cases.json');archiveCases=archiveInfo.cases;if(!Array.isArray(archiveCases)||!archiveCases.length)throw Error('没有可回放的真实计算条件。');configureArchive();}
  const response=await fetch(info.indices_url);if(!response.ok)throw Error('完整几何索引无法加载');indices=new Uint8Array(await response.arrayBuffer());
  if(indices.length!==1080000||indices.some(i=>i>=info.records.length))throw Error('结构索引尺寸或数据库映射无效');
  $('h6-content').hidden=false;$('h6-error').hidden=true;$('h6-model-version').textContent=info.model_version+(archiveMode?' · 预计算结果回放':' · 本机实时计算');
  if(!archiveMode)$('h6-intro').textContent='调整三项物理参数，在固定器件上重新计算双偏振复电场。';
  $('h6-target').src=info.target_url;$('h6-target').hidden=false;
  setKey(info.nominal_key||{alpha_deg:0,theta_deg:0,d23_m:.006},false);
  createViewers();ready=true;status('完整三层索引已加载；点击“重新计算”执行当前参数');
  $('h6-key').textContent=keyText(key());
  if(archiveMode){const selected=new URL(location.href).searchParams.get('holo600_case');if(selected&&!archiveCases.some(c=>c.id===selected)){fail('链接中的归档条件不存在。未显示替代结果，请从列表选择一个已计算条件。');status('请求的归档条件不存在，尚未显示结果。','error');return;}await chooseArchive(selected||archiveInfo.default_id||archiveCases.find(c=>sameKey(c.keys,info.nominal_key))?.id||archiveCases[0].id);return;}
  const archivedId=new URL(location.href).searchParams.get('holo600_run');
  if(archivedId){
   const saved=await fetchJSON('/api/holo600/jobs/'+encodeURIComponent(archivedId));
   if(saved.status!=='complete'||saved.result?.design_sha256!==info.design_sha256)throw Error('已保存结果尚未完成，或结构版本与当前设计不一致。');
   setKey(saved.result.keys,false);$('h6-reference').checked=saved.result.reference_enabled;syncGeometry();$('h6-key').textContent=keyText(key());showResult(saved.result,true);status('已保存结果回看 · '+saved.result.created_at+' · 未重新计算');
  }
 }catch(e){fail(e.message);$('h6-model-version').textContent=archiveMode?'归档数据未能加载':'本机服务尚未就绪';}finally{loading=false;}
}
function setKey(k,changed=true){if(archiveMode&&ready&&changed){const row=archiveCases.find(c=>sameKey(c.keys,k));if(row)chooseArchive(row.id);else status('此参数组合尚无归档结果，不能在静态网页重算。','error');return;}for(const [name,value]of [['alpha',k.alpha_deg],['theta',k.theta_deg],['distance',k.d23_m*1000]]){$('h6-'+name).value=value;$('h6-'+name+'-number').value=value;}if(changed)markStale();}
async function calculate(){
 if(!ready){await initialize();if(!ready)return;}
 if(archiveMode){status('当前为预计算结果回放；请使用已计算条件选择器。');return;}
 if(!validKey()){status('参数无效：偏振0–180°，转角0–360°，入口间距6–10 mm','error');return;}
 if(running){autofollow=true;status('正在计算，结束后将计算最新参数','running');return;}
 clearTimeout(pendingTimer);const generation=revision,k=key(),reference=$('h6-reference').checked;running=true;autofollow=false;$('h6-calculate').disabled=true;
 try{
  status('提交全尺寸复场计算…','running');
  const {job_id}=await fetchJSON('/api/holo600/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys:k,reference_enabled:reference})});
  let job;do{await new Promise(r=>setTimeout(r,500));job=await fetchJSON('/api/holo600/jobs/'+job_id);status(job.stage+(generation!==revision?' · 参数已变，此次结果不会覆盖新状态':''),'running');}while(job.status==='running'||job.status==='queued');
  if(job.status==='failed')throw Error(job.error||'后端计算失败');
  if(generation===revision){showResult(job.result);status(`完成 · 全尺寸 ${job.result.grid}×${job.result.grid} FFT · ${number(job.result.elapsed_seconds,2)} s`,'complete');}
  else{status('上一次计算完成；等待最新参数计算');autofollow=$('h6-auto').checked;}
 }catch(e){status(e.message,'error');$('h6-results').dataset.stale='true';}
 finally{running=false;$('h6-calculate').disabled=false;if(autofollow){autofollow=false;calculate();}}
}
function showResult(result,archived=false){
 lastResult=result;$('h6-results').dataset.stale='false';$('h6-result-key').textContent=keyText(result.keys);
 $('h6-results').dataset.mode=archived?'archived':'computed';
 const imgMap={detector:'h6-detector',layer3:'h6-layer3',phase_x:'h6-phase-x',phase_y:'h6-phase-y',target:'h6-target',hologram_x:'h6-hologram',reconstruction:'h6-reconstruction'};
 for(const [name,id]of Object.entries(imgMap)){const el=$(id),has=!!result.images[name];el.hidden=true;el.closest('figure').hidden=!has;el.dataset.fieldJob=result.job_id;
  if(has){el.onload=()=>{if(el.dataset.fieldJob===result.job_id)el.hidden=false;};el.onerror=()=>{if(el.dataset.fieldJob===result.job_id){el.hidden=true;status('当前条件的图像未能读取；参数与数据记录保留，请刷新重试。','error');}};el.src=result.images[name];}
  else{el.onload=null;el.onerror=null;el.removeAttribute('src');}
 }
 $('h6-missing-fields').hidden=!!result.images.layer3;
 $('h6-detector-caption').textContent=`探测面总强度 · 固定目标色标 · ${result.display_scale?.detector_pixels_above_scale??0} 像素超过显示上限，指标使用原始值`;
 const m=result.metrics,ncc=m.NCC??m.ncc,psnr=m.PSNR_dB??m.PSNR??m.psnr,ssim=m.SSIM??m.ssim;
 $('h6-metrics').innerHTML=`<span>NCC <b>${number(ncc)}</b></span><span>PSNR <b>${number(psnr,2)} dB</b></span><span>SSIM <b>${number(ssim)}</b></span>`;
 $('h6-metrics').dataset.ncc=ncc;$('h6-metrics').dataset.psnr=psnr;$('h6-metrics').dataset.ssim=ssim;
 history.unshift({keys:result.keys,ncc,psnr,ssim,job_id:result.job_id});if(history.length>12)history.pop();$('h6-history').replaceChildren();
 for(const row of history){const tr=document.createElement('tr');for(const text of [`${number(row.keys.alpha_deg,1)}° / ${number(row.keys.theta_deg,1)}° / ${number(row.keys.d23_m*1000,2)} mm`,number(row.ncc),number(row.psnr,2)+' dB',number(row.ssim)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('h6-history').append(tr);}
 $('h6-holography').hidden=!result.reference_enabled;$('h6-holography-error').textContent=result.holography?`理想相移复场相对误差：${result.holography.field_relative_error.toExponential(3)}。无噪声理想重建一致是算法检查，不代表实验验证。`:'';
 $('h6-evidence').textContent=JSON.stringify({job_id:result.job_id,keys:result.keys,design_sha256:result.design_sha256,frequency_Hz:result.frequency_Hz,period_m:result.period_m,grid:result.grid,kernel_hashes:result.kernel_hashes,power:result.power,metrics:result.metrics,display_scale:result.display_scale,propagation_seconds:result.propagation_seconds,elapsed_seconds:result.elapsed_seconds,measurement:result.holography||'双偏振复场直接计算；未配置干涉参考',phase_warning:result.phase_warning},null,2);
 $('h6-downloads').replaceChildren();for(const [name,url]of Object.entries(result.downloads)){const a=document.createElement('a');a.href=url;a.download='';a.textContent={fields:'原始600×600复场 NPZ',metadata:'本次参数与证据 JSON',holography:'相移全息数据 NPZ'}[name]||name;$('h6-downloads').append(a);}
 const reopen=document.createElement('a');reopen.href=archiveMode?'?holo600_case='+encodeURIComponent(activeCaseId)+'#holo600':'?holo600_run='+encodeURIComponent(result.job_id)+'#holo600';reopen.textContent='重新打开此已保存结果';$('h6-downloads').append(reopen);
 root.dataset.resultJob=result.job_id;root.dataset.resultKey=JSON.stringify(result.keys);
}
function renderer(container,height){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#edf2f8');
 const camera=new THREE.PerspectiveCamera(38,1,.001,1000);
 const r=new THREE.WebGLRenderer({antialias:true,alpha:false});r.setPixelRatio(Math.min(devicePixelRatio,1.7));r.outputColorSpace=THREE.SRGBColorSpace;container.append(r.domElement);
 const controls=new OrbitControls(camera,r.domElement);controls.enableDamping=true;controls.minDistance=.1;controls.maxDistance=400;controls.enablePan=true;
 r.domElement.style.touchAction='pan-y'; // OrbitControls构造器默认为none；默认保留整页触屏滚动。
 const lights=new THREE.HemisphereLight(0xffffff,0x738195,2.2);scene.add(lights);const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-40,-50,-80);scene.add(sun);
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight||height;if(!w)return;r.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(container);resize();
 r.domElement.addEventListener('pointerdown',e=>{controls.enabled=e.pointerType!=='touch'||$('h6-touch-enable').checked;});
 return {scene,camera,r,controls,container,resize};
}
function createViewers(){
 try{
  if(viewer)return;
  const touch=document.createElement('label');touch.innerHTML='<input type="checkbox" id="h6-touch-enable">启用触屏旋转';$('h6-viewport').nextElementSibling.append(touch);
  viewer=renderer($('h6-viewport'),360);local=renderer($('h6-local-viewport'),250);
  $('h6-touch-enable').addEventListener('change',()=>{for(const v of[viewer,local])v.r.domElement.style.touchAction=$('h6-touch-enable').checked?'none':'pan-y';});
  const N=600,p=info.period_m*1000,size=N*p;
  for(let layer=0;layer<3;layer++){
   const g=new THREE.Group();g.name='Holo600_Layer'+(layer+1);g.userData.layer=layer;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=N;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(N,N);
   for(let i=0;i<N*N;i++){const rec=info.records[indices[layer*N*N+i]],v=(rec.L_um-30)/60,j=i*4;pixels.data[j]=Math.round(45+v*125);pixels.data[j+1]=Math.round(65+v*115);pixels.data[j+2]=Math.round(90+v*110);pixels.data[j+3]=255;}
   ctx.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearFilter;
   const face=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({map:texture,roughness:.68,side:THREE.DoubleSide}));face.position.z=-.008;face.name='Actual600GeometryTexture';face.userData.layer=layer;g.add(face);
   const base=new THREE.Mesh(new THREE.BoxGeometry(size,size,info.substrate_height_m*1000),new THREE.MeshStandardMaterial({color:0x555f70,roughness:.5,metalness:.12}));base.position.z=(info.pillar_height_m+info.substrate_height_m/2)*1000;g.add(base);
   const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size,size,1)),new THREE.LineBasicMaterial({color:0x71819a,transparent:true,opacity:.65}));outline.position.z=.5;g.add(outline);viewer.scene.add(g);layerGroups.push(g);
  }
  const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(-37,-37,-4),27,0x2c7eb7,2,1);viewer.scene.add(arrow);
  const pick=new THREE.Raycaster(),mouse=new THREE.Vector2();let pointerStart;
  viewer.r.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});
  viewer.r.domElement.addEventListener('pointerup',e=>{if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)return;const rect=viewer.r.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);pick.setFromCamera(mouse,viewer.camera);const hits=pick.intersectObjects(layerGroups.filter(g=>g.visible).map(g=>g.children[0]),false);if(hits.length){const h=hits[0],g=layerGroups[h.object.userData.layer],pt=g.worldToLocal(h.point.clone()),col=Math.floor(pt.x/p+N/2),row=Math.floor(pt.y/p+N/2);$('h6-local-layer').value=h.object.userData.layer;$('h6-row').value=Math.max(0,Math.min(599,row));$('h6-col').value=Math.max(0,Math.min(599,col));updateLocal();}});
  let localStart;local.r.domElement.addEventListener('pointerdown',e=>{localStart=[e.clientX,e.clientY];});local.r.domElement.addEventListener('pointerup',e=>{if(!localStart||Math.hypot(e.clientX-localStart[0],e.clientY-localStart[1])>6)return;const rect=local.r.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);pick.setFromCamera(mouse,local.camera);const hits=pick.intersectObject(localMesh,false);if(hits.length&&hits[0].instanceId!==undefined)cellInfo(selectedPatch[hits[0].instanceId]);});
  syncGeometry();resetView();updateLocal();frame();
 }catch(e){$('h6-webgl-fallback').hidden=false;$('h6-webgl-fallback').textContent='三维降级：'+e.message+'；真实数据及光场计算仍可使用。';}
}
function cellInfo(cell){if(!cell)return;const rec=info.records[cell.id],x=(cell.col-299.5)*.11,y=(cell.row-299.5)*.11;$('h6-cell-info').textContent=`L${cell.layer+1} · 行 ${cell.row} / 列 ${cell.col} · 位置 (${x.toFixed(3)}, ${y.toFixed(3)}) mm · 数据库 ${rec.id} · L=${rec.L_um} μm，W=${rec.W_um} μm，柱高500 μm。|tₓ|=${rec.responses.x.amplitude.toFixed(4)}，|tᵧ|=${rec.responses.y.amplitude.toFixed(4)}。`;root.dataset.selectedCell=JSON.stringify(cell);}
function updateLocal(){
 if(!local||!indices)return;const n=600,s=32,p=.11,layer=Number($('h6-local-layer').value),row=Math.round(Number($('h6-row').value)),col=Math.round(Number($('h6-col').value));
 if(!Number.isFinite(row)||!Number.isFinite(col)||row<0||row>599||col<0||col>599){$('h6-cell-info').textContent='行、列必须为0–599的整数。';return;}
 const r0=Math.max(0,Math.min(568,row-16)),c0=Math.max(0,Math.min(568,col-16));
 if(localMesh){local.scene.remove(localMesh);localMesh.geometry.dispose();localMesh.material.dispose();}
 if(local.base){local.scene.remove(local.base);local.base.geometry.dispose();local.base.material.dispose();}
 localMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x56677f,roughness:.45,metalness:.2}),s*s);localMesh.name='Actual32x32Pillars';localMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);selectedPatch=[];
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
 for(let rr=0;rr<s;rr++)for(let cc=0;cc<s;cc++){const id=indices[layer*n*n+(r0+rr)*n+c0+cc],rec=info.records[id],i=rr*s+cc;position.set((cc-15.5)*p,(rr-15.5)*p,.25);scale.set(rec.L_um/1000,rec.W_um/1000,.5);matrix.compose(position,quaternion,scale);localMesh.setMatrixAt(i,matrix);selectedPatch.push({layer,row:r0+rr,col:c0+cc,id});}
 localMesh.instanceMatrix.needsUpdate=true;local.scene.add(localMesh);local.base=new THREE.Mesh(new THREE.BoxGeometry(s*p,s*p,.5),new THREE.MeshStandardMaterial({color:0x7d8ca0,roughness:.55}));local.base.position.z=.75;local.scene.add(local.base);local.camera.position.set(-3.8,-4.5,-4.5);local.controls.target.set(0,0,.4);local.controls.minDistance=.5;local.controls.maxDistance=30;local.camera.near=.005;local.camera.far=100;local.camera.updateProjectionMatrix();local.controls.update();
 cellInfo({layer,row,col,id:indices[layer*n*n+row*n+col]});root.dataset.localCount='1024';
}
function syncGeometry(){if(!viewer||layerGroups.length!==3)return;const k=key();if(!validKey())return;layerGroups[0].position.z=0;layerGroups[1].position.z=5;layerGroups[2].position.z=5+k.d23_m*1000;layerGroups[1].rotation.z=k.theta_deg*Math.PI/180;root.dataset.geometryKey=JSON.stringify(k);}
function resetView(){if(!viewer)return;viewer.camera.position.set(-90,-70,-95);viewer.controls.target.set(0,0,6);viewer.controls.minDistance=25;viewer.controls.maxDistance=300;viewer.camera.near=.05;viewer.camera.far=1200;viewer.camera.updateProjectionMatrix();viewer.controls.update();}
function frame(){requestAnimationFrame(frame);if(root.hidden||document.hidden)return;for(const v of[viewer,local])if(v){v.controls.update();v.r.render(v.scene,v.camera);}}
for(const name of['alpha','theta','distance']){
 $('h6-'+name).addEventListener('input',()=>{$('h6-'+name+'-number').value=$('h6-'+name).value;markStale();});
 $('h6-'+name+'-number').addEventListener('input',()=>{const input=$('h6-'+name+'-number');if(input.validity.valid)$('h6-'+name).value=input.value;markStale();});
}
$('h6-calculate').addEventListener('click',calculate);$('h6-match').addEventListener('click',()=>setKey(info?.nominal_key||{alpha_deg:0,theta_deg:0,d23_m:.006}));
for(const [button,k]of [['h6-wrong-alpha',{alpha_deg:90,theta_deg:0,d23_m:.006}],['h6-wrong-theta',{alpha_deg:0,theta_deg:90,d23_m:.006}],['h6-wrong-distance',{alpha_deg:0,theta_deg:0,d23_m:.01}],['h6-wrong-all',{alpha_deg:90,theta_deg:90,d23_m:.01}]])$(button).addEventListener('click',()=>setKey(k));
$('h6-reference').addEventListener('change',markStale);$('h6-local-update').addEventListener('click',updateLocal);$('h6-local-layer').addEventListener('change',updateLocal);$('h6-camera-reset').addEventListener('click',resetView);
$('h6-case-select').addEventListener('change',()=>chooseArchive($('h6-case-select').value));
for(const [id,delta]of[['h6-case-prev',-1],['h6-case-next',1]])$(id).addEventListener('click',()=>{const index=archiveCases.findIndex(c=>c.id===activeCaseId)+delta;if(index>=0&&index<archiveCases.length)chooseArchive(archiveCases[index].id);});
document.querySelectorAll('[data-h6-visible]').forEach(c=>c.addEventListener('change',()=>{if(layerGroups[c.dataset.h6Visible])layerGroups[c.dataset.h6Visible].visible=c.checked;}));
$('h6-view-fullscreen').addEventListener('click',()=>{const elem=$('h6-viewport');if(document.fullscreenElement)document.exitFullscreen();else elem.requestFullscreen().catch(()=>status('当前浏览器不支持全屏'));});
document.addEventListener('material-view',e=>{if(e.detail==='holo600'){initialize();viewer?.resize();local?.resize();}});if(document.body.dataset.view==='holo600')initialize();
