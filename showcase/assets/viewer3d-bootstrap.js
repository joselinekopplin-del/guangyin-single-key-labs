/* 首页中的查看器接近屏幕时加载；切换页面保留同一个模型和相机。 */
(()=>{
 let started=false;
 const section=document.getElementById('structure');
 const load=()=>{if(started||document.body.dataset.view!=='overview')return;started=true;import('./viewer3d.js?v=review1').catch(e=>{document.getElementById('viewer-status').textContent='三维模块加载失败';document.getElementById('fallback-text').textContent='降级显示：静态结构预览，非交互模型。请通过HTTP启动页面并检查本地资源。'+e.message;console.error('viewer module load',e);});};
 const near=()=>{const r=section.getBoundingClientRect();return r.top<innerHeight+220&&r.bottom>0;};
 document.addEventListener('material-view',()=>{if(near())load();});
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load();},{rootMargin:'220px'});observer.observe(section);}else{load();}
 if(near())load();
})();
