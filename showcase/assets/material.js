/* Material 成果页导航与展示交互；不参与传播、解码或误码计算。 */
(()=>{'use strict';
 const names=['overview','lab','data','boundaries'];
 const title={overview:'成果展示',lab:'交互演示',data:'器件数据',boundaries:'研究边界'};
 const normalize=v=>v==='research'?'data':names.includes(v)?v:'overview';
 function show(view,{historyEntry=true,scroll=true}={}){
  const structureAnchor=view==='structure';
  view=normalize(view);
  for(const n of names)document.getElementById('view-'+n).hidden=n!==view;
  for(const a of document.querySelectorAll('.nav-item')){
   const active=a.dataset.view===view;a.classList.toggle('active',active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
  document.body.dataset.view=view;document.dispatchEvent(new CustomEvent('material-view',{detail:view}));document.title=title[view]+' · Trikey';
  const hash=structureAnchor?'structure':view;
  if(historyEntry&&location.hash!=='#'+hash)history.pushState({view},'', '#'+hash);
  if(scroll){if(structureAnchor)requestAnimationFrame(()=>document.getElementById('structure').scrollIntoView({block:'start',behavior:'instant'}));else window.scrollTo({top:0,behavior:'instant'});}
 }
 window.showMaterialView=show;
 document.addEventListener('click',e=>{
  if(e.target.closest('.skip-link')){e.preventDefault();const main=document.getElementById('page-content');main.tabIndex=-1;main.focus();window.scrollTo({top:0,behavior:'instant'});return;}
  const a=e.target.closest('a[data-view],button[data-view]');
  if(a&&a.dataset.view){e.preventDefault();show(a.dataset.view);return;}
  const replay=e.target.closest('[data-replay]');
  if(replay){show('lab');document.getElementById('mode-replay').click();const select=document.getElementById('replay-select');select.value=replay.dataset.replay;select.dispatchEvent(new Event('change'));return;}
  if(e.target.closest('#details-link')){e.preventDefault();show('data');}
 },true);
 // 旧引导的最后一步会程序化点击器件标签；先展开容器，再执行原有滚动。
 document.addEventListener('click',e=>{if(e.target.closest('[data-detail]')&&document.body.dataset.view!=='data')show('data',{scroll:false});},true);
 addEventListener('popstate',()=>show(location.hash.slice(1),{historyEntry:false}));
 addEventListener('hashchange',()=>show(location.hash.slice(1),{historyEntry:false}));
 show(location.hash.slice(1),{historyEntry:false});
 const cases=window.DEMO_CASES?.cases||[],a=cases.find(x=>x.id==='A'),c=cases.find(x=>x.id==='C');
 if(a?.results?.length){const x=a.results[0].evaluation;document.getElementById('nominal-metric').textContent=x.bit_errors+' / '+x.packet_bits;}
 if(c?.results?.length>1){const first=c.results[0].evaluation,last=c.results[c.results.length-1].evaluation;document.getElementById('calibration-metric').textContent=first.bit_errors+' → '+last.bit_errors;}
 const dialog=document.getElementById('figure-dialog'),large=document.getElementById('figure-large'),caption=document.getElementById('figure-caption');
 const openImage=img=>{large.src=img.src;large.alt=img.alt;caption.textContent=img.closest('figure')?.querySelector('figcaption')?.textContent||img.alt;dialog.showModal();};
 for(const img of document.querySelectorAll('.hero-visual img,.figure-grid img')){
  img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','放大查看：'+img.alt);img.title='点击放大';
  img.addEventListener('click',()=>openImage(img));img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openImage(img);}});
 }
 document.getElementById('close-figure').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
})();
