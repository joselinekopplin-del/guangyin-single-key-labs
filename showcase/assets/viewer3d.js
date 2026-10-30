import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/three/addons/environments/RoomEnvironment.js';

const $=id=>document.getElementById(id),viewport=$('model-viewport'),status=$('viewer-status');
const info={
 L1:{title:'L1 · 第一层',text:'第一层硅柱阵列。入口 X = 0 mm，先经过高 0.5 mm 的矩形柱，再经过厚 0.5 mm 的有限基底。长宽由设计 C 的真实几何索引决定。'},
 L2:{title:'L2 · 第二层',text:'当前系统定义的旋转层。标称展示转角为 0°，入口 X = 5 mm。这里拖动的是相机，不是器件物理转角。'},
 L3:{title:'L3 · 第三层',text:'第三层硅柱阵列。标称入口 X = 11 mm；L2–L3 入口面间距为 6 mm，含前层 1 mm 厚度，空气间隙为 5 mm。'},
 MeasurementPlane:{title:'复场采样面',text:'计算定义的双偏振复电场采样面，X = 16 mm。显示的是采样范围示意，不代表已实现的相机或实体探测器，也不是接收信号强度图。'},
 Guides:{title:'方向辅助示意',text:'箭头标示光沿 +X 的传播顺序。箭头的颜色、粗细和照明仅用于展示，不是 FDTD 求解得到的电磁场。'}
};
let scene,camera,renderer,controls,model,selected=null,ready=false,exploded=false,touch=false,manifest;
let focused=null,overviewVisibility=null,studioKey,inView=true;const edgeOverlays=[];
const components={},basePositions={},labels={},box=new THREE.Box3(),center=new THREE.Vector3();let radius=1;
function describeModel(){
 const p=manifest.physical,n=v=>Number(v.toFixed(4)).toString(),x2=p.d12_entrance_mm,x3=x2+p.d23_entrance_mm,xm=x3+p.d3_measurement_mm;
 info.L1.text=`第一层 ${p.cells_per_axis} × ${p.cells_per_axis} 硅柱阵列。入口 X = 0 mm，先经过高 ${n(p.pillar_height_mm)} mm 的矩形柱，再经过厚 ${n(p.substrate_height_mm)} mm 的有限基底。长宽由冻结设计 C 的几何索引决定。`;
 info.L2.text=`当前系统定义的旋转层。几何展示转角为 ${n(p.layer2_rotation_deg)}°，入口 X = ${n(x2)} mm。拖动查看器改变的是相机，不是器件转角。`;
 info.L3.text=`第三层硅柱阵列。入口 X = ${n(x3)} mm；L2–L3 入口面间距为 ${n(p.d23_entrance_mm)} mm，含前层柱和基底，空气间隙为 ${n(p.d23_entrance_mm-p.pillar_height_mm-p.substrate_height_mm)} mm。`;
 info.MeasurementPlane.text=`计算定义的双偏振复电场采样面，X = ${n(xm)} mm。显示的是采样范围示意，不代表已实现的实体探测器，也不是接收信号强度图。`;
 $('model-config-note').textContent=`${n(p.frequency_THz)} THz 文献参数假设模型。光沿 +X 方向依次经过 L1、L2、L3，到达双偏振复场采样面。柱高 ${n(p.pillar_height_mm)} mm，基底厚 ${n(p.substrate_height_mm)} mm；三层入口位于 0、${n(x2)}、${n(x3)} mm，采样面位于 ${n(xm)} mm。箭头表示传播方向，采样框表示计算平面。`;
 const facts=[['阵列',`${p.cells_per_axis} × ${p.cells_per_axis} / 层`],['横向孔径',`${n(p.cells_per_axis*p.period_mm)} mm`],['单元周期',`${n(p.period_mm*1000)} μm`],['柱高 / 基底',`${n(p.pillar_height_mm*1000)} / ${n(p.substrate_height_mm*1000)} μm`]];
 $('geometry-facts').replaceChildren();for(const[label,value]of facts){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('geometry-facts').append(dt,dd);}
}
const selectionBox=new THREE.Box3(),highlight=new THREE.Box3Helper(selectionBox,0xba8519),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const fail=e=>{ready=false;status.textContent='三维不可用 · 已切换静态预览';viewport.classList.add('error');$('viewer-fallback').hidden=false;$('fallback-text').textContent='降级显示：Blender 静态预览，非交互模型。'+e.message+'；请使用HTTP服务，并确认浏览器支持WebGL2、models/system.glb和本地依赖完整。';console.error('viewer3d',e);disableControls(true);};
function disableControls(disabled){for(const el of document.querySelectorAll('.viewer-toolbar button,#viewer-touch,#view-labels,#view-arrows,#view-edges'))el.disabled=disabled;}
disableControls(true);
function resize(){if(!renderer)return;const w=viewport.clientWidth,h=viewport.clientHeight;if(w<1||h<1)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function bounds(){box.makeEmpty();for(const [id,obj]of Object.entries(components)){if(id!=='Guides'&&obj.visible)box.expandByObject(obj);}if(box.isEmpty())box.setFromObject(model);box.getCenter(center);radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,1e-6);camera.near=radius/500;camera.far=radius*150;camera.updateProjectionMatrix();controls.minDistance=radius*1.06;controls.maxDistance=radius*10;
 if(studioKey){studioKey.target.position.copy(center);studioKey.position.copy(center).add(new THREE.Vector3(-1,1.4,1.1).normalize().multiplyScalar(radius*5));Object.assign(studioKey.shadow.camera,{left:-radius*1.6,right:radius*1.6,top:radius*1.6,bottom:-radius*1.6,near:radius*.05,far:radius*12});studioKey.shadow.camera.updateProjectionMatrix();}
}
function view(which='reset'){
 if(!ready)return;bounds();controls.autoRotate=false;$('view-spin').textContent='开始自动旋转';$('view-spin').setAttribute('aria-pressed','false');
 // 清除拖动惯性后再切换视角，保留 OrbitControls 的固定 Y-up 轨道轴。
 controls.enableDamping=false;controls.update();controls.enableDamping=true;
 const dirs={front:new THREE.Vector3(-1,0,0),side:new THREE.Vector3(0,0,1),top:new THREE.Vector3(0,1,.0001),reset:new THREE.Vector3(-.8,.65,1.2)};
 const dir=(dirs[which]||dirs.reset).normalize();camera.up.set(0,1,0);
 resize();const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
 const right=new THREE.Vector3().crossVectors(camera.up,dir).normalize(),up=new THREE.Vector3().crossVectors(dir,right);let fit=0;
 // 按包围盒在当前视角的投影适配，避免细长光路被球形包围体缩得过小。
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).sub(center);fit=Math.max(fit,v.dot(dir)+Math.abs(v.dot(right))/tanH,v.dot(dir)+Math.abs(v.dot(up))/tanV);}
 camera.position.copy(center).addScaledVector(dir,Math.max(fit*1.22,controls.minDistance*1.1));controls.target.copy(center);controls.update();
}
function select(id){
 if(!components[id]?.visible)return;selected=id;const row=info[id];$('part-info').replaceChildren();const h=document.createElement('h3');h.textContent=row.title;const p=document.createElement('p');p.textContent=row.text;$('part-info').append(h,p);
 for(const [key,label]of Object.entries(labels))label.classList.toggle('selected',key===id);
 for(const b of document.querySelectorAll('[data-component]'))b.classList.toggle('selected',b.dataset.component===id);
 highlight.visible=true;selectionBox.setFromObject(components[id]);
 $('view-focus').textContent=['L1','L2','L3'].includes(id)?`查看 ${id} 细节`:'查看 L1 细节';
}
function syncVisibility(){for(const id of ['L1','L2','L3','MeasurementPlane'])$('visible-'+id).checked=components[id].visible;$('view-arrows').checked=components.Guides.visible;}
function focusLayer(id){
 if(!ready)return;if(!['L1','L2','L3'].includes(id))id='L1';
 if(!focused)overviewVisibility=Object.fromEntries(Object.entries(components).map(([key,o])=>[key,o.visible]));focused=id;
 for(const[key,o]of Object.entries(components))o.visible=key===id;
 syncVisibility();select(id);view();$('view-overall').hidden=false;$('model-view-label').textContent=id+' · 单层细节';
}
function returnOverall(){if(focused){for(const[key,visible]of Object.entries(overviewVisibility))components[key].visible=visible;focused=null;overviewVisibility=null;syncVisibility();$('view-overall').hidden=true;}view();$('model-view-label').textContent=exploded?'分层展开 · 展示位置偏移':'整体结构 · 真实几何比例';}
function visibility(id,visible){const object=components[id];object.visible=visible;if(selected===id&&!visible){selected=null;highlight.visible=false;$('part-info').innerHTML='<h3>部件已隐藏</h3><p>重新勾选部件可恢复显示。</p>';}}
function labelPositions(){for(const[id,label]of Object.entries(labels)){const obj=components[id],b=new THREE.Box3().setFromObject(obj),v=b.getCenter(new THREE.Vector3());v.y=b.max.y+radius*.03;v.project(camera);label.hidden=!$('view-labels').checked||!obj.visible||v.z>1||v.z< -1;label.style.left=((v.x*.5+.5)*viewport.clientWidth)+'px';label.style.top=((-v.y*.5+.5)*viewport.clientHeight)+'px';}}
function updateScale(){const pixelsPerUnit=viewport.clientHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*camera.position.distanceTo(controls.target)),limit=Math.min(120,viewport.clientWidth*.28),perMm=pixelsPerUnit*manifest.gltf_mm_to_unit;const values=[.005,.01,.02,.05,.1,.2,.5,1,2,5,10,20,50,100];let mm=values[0];for(const v of values)if(v*perMm<=limit)mm=v;$('model-scale-line').style.width=(mm*perMm)+'px';$('model-scale-text').textContent=(mm<1?Number((mm*1000).toFixed(2))+' μm':mm+' mm')+' · 视图中心';}
function frame(){requestAnimationFrame(frame);if(!ready||document.body.dataset.view!=='overview'||document.hidden||!inView)return;controls.update();if(selected&&components[selected].visible)selectionBox.setFromObject(components[selected]);labelPositions();updateScale();renderer.render(scene,camera);}
function explode(){exploded=!exploded;const shift=manifest.gltf_mm_to_unit;for(const[id,sign]of [['L1',-1],['L2',0],['L3',1]]){const obj=components[id];obj.position.copy(basePositions[id]);obj.updateMatrixWorld(true);if(exploded){const world=obj.getWorldPosition(new THREE.Vector3());world.y+=sign*4*shift;obj.position.copy(obj.parent.worldToLocal(world));}}
 $('view-explode').setAttribute('aria-pressed',String(exploded));$('view-explode').textContent=exploded?'恢复整体结构':'分层展开';$('scale-note').textContent=exploded?'分层展开：展示位置已错开，不按实际相对位置显示；真实层间距未改变。':'按配置物理比例显示；硅外观和照明为可视化近似，不代表实物照片。';model.updateMatrixWorld(true);returnOverall();}
async function init(){try{
 status.textContent='正在读取 Blender 模型…';
 const response=await fetch(new URL('../models/manifest.json',import.meta.url));if(!response.ok)throw Error('模型来源配置未找到');manifest=await response.json();
 if(!Number.isFinite(manifest.gltf_mm_to_unit)||manifest.gltf_mm_to_unit<=0)throw Error('模型缺少已核实的毫米单位换算，请重新生成模型');
 describeModel();
 scene=new THREE.Scene();scene.background=new THREE.Color('#edf1f5');camera=new THREE.PerspectiveCamera(38,1,.001,1000);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#edf1f5');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;viewport.prepend(renderer.domElement);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(Error('WebGL上下文丢失，请刷新页面'));});
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.autoRotateSpeed=.7;controls.screenSpacePanning=true;
 controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
 // 移动设备默认将单指滚动交还页面；用户明确启用视口触控后再接管手势。
 renderer.domElement.style.touchAction='pan-y';renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!touch)e.stopImmediatePropagation();},true);
 // Studio environment is display lighting only; it is never added to the device hierarchy.
 const studio=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.04).texture;scene.environmentIntensity=.35;studio.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0x8091a3,.6));const key=new THREE.DirectionalLight(0xfff5e8,2.6);studioKey=key;scene.add(key.target);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.000005;key.shadow.normalBias=.0000002;scene.add(key);const fill=new THREE.DirectionalLight(0xdceaff,.6);fill.position.set(.02,.006,-.012);scene.add(fill);
 const gltf=await new GLTFLoader().loadAsync(new URL('../models/system.glb',import.meta.url).href,p=>{status.textContent=p.total?'加载模型 '+Math.round(p.loaded/p.total*100)+'%':'正在读取模型文件…';});model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
 for(const id of Object.keys(info)){const o=model.getObjectByName(id);if(!o)throw Error('GLB缺少稳定部件名：'+id);components[id]=o;basePositions[id]=o.position.clone();}
 for(const id of ['L1','L2','L3'])components[id].traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const edges=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,25),new THREE.LineBasicMaterial({color:0x83b2ce,transparent:true,opacity:.36}));edges.visible=false;edges.userData.displayOnly=true;o.add(edges);edgeOverlays.push(edges);}});
 scene.add(highlight);highlight.visible=false;
 for(const id of ['L1','L2','L3','MeasurementPlane']){
  const row=document.createElement('div');row.className='component-row';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.id='visible-'+id;check.setAttribute('aria-label','显示'+info[id].title);check.onchange=()=>visibility(id,check.checked);
  const b=document.createElement('button');b.textContent=info[id].title;b.dataset.component=id;b.onclick=()=>{if(focused&&['L1','L2','L3'].includes(id))focusLayer(id);else select(id);};row.append(check,b);$('component-list').append(row);
  const label=document.createElement('button');label.className='model-label';label.dataset.part=id;label.textContent=info[id].title;label.onclick=()=>select(id);labels[id]=label;$('model-labels').append(label);
 }
 let down;
 renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,button:e.button};});
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||down.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(Object.values(components).filter(o=>o.visible&&o.name!=='Guides'),true);if(hits.length){let o=hits[0].object;while(o&&!info[o.name])o=o.parent;if(o)select(o.name);}});
 ready=true;resize();view();disableControls(false);$('viewer-fallback').hidden=true;status.textContent='模型已加载';
 $('view-reset').onclick=returnOverall;for(const b of document.querySelectorAll('[data-camera]'))b.onclick=()=>view(b.dataset.camera);
 $('view-focus').onclick=()=>focusLayer(selected);$('view-overall').onclick=returnOverall;$('view-edges').onchange=()=>{for(const edges of edgeOverlays)edges.visible=$('view-edges').checked;};
 $('view-explode').onclick=explode;$('view-arrows').onchange=()=>visibility('Guides',$('view-arrows').checked);
 $('view-spin').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('view-spin').setAttribute('aria-pressed',String(controls.autoRotate));$('view-spin').textContent=controls.autoRotate?'暂停自动旋转':'开始自动旋转';};
 $('viewer-touch').onclick=()=>{touch=!touch;renderer.domElement.style.touchAction=touch?'none':'pan-y';$('viewer-touch').setAttribute('aria-pressed',String(touch));$('viewer-touch').textContent=touch?'停用触控，恢复页面滚动':'启用触控操作';};
 new ResizeObserver(resize).observe(viewport);new IntersectionObserver(entries=>{inView=entries.some(e=>e.isIntersecting);if(inView)resize();},{rootMargin:'80px'}).observe(viewport);frame();
 }catch(e){fail(e);}}
$('viewer-fullscreen').onclick=async()=>{try{if(document.fullscreenElement===$('viewer-shell'))await document.exitFullscreen();else await $('viewer-shell').requestFullscreen();}catch(e){status.textContent='浏览器不允许全屏，请使用F11';}};
document.addEventListener('fullscreenchange',()=>{$('viewer-fullscreen').textContent=document.fullscreenElement===$('viewer-shell')?'退出查看器全屏':'查看器全屏';resize();});
// 只读诊断；无设置相机或物理参数的测试捷径。
window.viewer3dSnapshot=()=>({ready,selected,exploded,touch,focused,edges:$('view-edges').checked,scaleText:$('model-scale-text').textContent,camera:camera?.position.toArray(),target:controls?.target.toArray(),distance:controls?camera.position.distanceTo(controls.target):null,autoRotate:controls?.autoRotate,components:Object.fromEntries(Object.entries(components).map(([id,o])=>[id,{visible:o.visible,position:o.position.toArray(),worldPosition:o.getWorldPosition(new THREE.Vector3()).toArray()}])),labelVisible:$('view-labels').checked,triangles:renderer?.info.render.triangles,drawCalls:renderer?.info.render.calls,canvas:renderer?{width:renderer.domElement.width,height:renderer.domElement.height}:null});
init();
