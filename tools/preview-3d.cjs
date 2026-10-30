/* Local-only HTTP preview. Uses built-in Node modules; no install or FDTD. */
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),os=require('os'),cp=require('child_process');
const ROOT=fs.realpathSync(path.resolve(__dirname,'..'));
const ID=crypto.createHash('sha256').update(ROOT.toLowerCase()).digest('hex').slice(0,16);
const DIR=path.join(os.tmpdir(),'guangyin-3d-preview-'+ID),STATE=path.join(DIR,'state.json'),LOG=path.join(DIR,'server.log');
fs.mkdirSync(DIR,{recursive:true});
const app='guangyin-3d-preview-v1';
function log(message){fs.appendFileSync(LOG,new Date().toISOString()+' '+message+'\n','utf8');}
function request(port,pathname,method='GET',token){return new Promise(resolve=>{const r=http.request({hostname:'127.0.0.1',port,path:pathname,method,timeout:600,headers:token?{'x-preview-token':token}:{}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>{try{resolve(JSON.parse(body));}catch{resolve(null);}});});r.on('timeout',()=>{r.destroy();resolve(null);});r.on('error',()=>resolve(null));r.end();});}
async function identity(port){const d=await request(port,'/__guangyin_3d_identity');return d?.app===app&&d?.id===ID?d:null;}
function available(port){return new Promise(resolve=>{const s=require('net').createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
function openBrowser(url){
 if(process.env.GUANGYIN_NO_OPEN==='1')return;
 const roots=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean);
 const candidates=[process.env.GUANGYIN_BROWSER,...roots.flatMap(r=>[path.join(r,'Microsoft/Edge/Application/msedge.exe'),path.join(r,'Google/Chrome/Application/chrome.exe')])].filter(Boolean);
 const browser=candidates.find(p=>fs.existsSync(p));
 const child=browser?cp.spawn(browser,[url],{detached:true,stdio:'ignore'}):cp.spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`],{detached:true,windowsHide:true,stdio:'ignore'});
 child.on('error',err=>log('browser-open '+err.message));child.unref();log('browser requested: '+(browser||'Windows URL association'));
}
function serve(port){
 const token=crypto.randomBytes(24).toString('hex');
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
 const server=http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end('Bad URL');return;}
  if(pathname==='/__guangyin_3d_identity'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({app,id:ID,port,pid:process.pid}));return;}
  if(pathname==='/__guangyin_3d_stop'&&req.method==='POST'){
   if(req.headers['x-preview-token']!==token){res.writeHead(403).end();return;}
   res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({stopped:true,id:ID}));log('stop requested');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  if(pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403).end('Private paths are not served');return;}
  let file=path.resolve(ROOT,'.'+pathname);
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
  try{
   if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   const actual=fs.realpathSync(file);if(actual!==ROOT&&!actual.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
   const stat=fs.statSync(actual);if(!stat.isFile()){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':mime[path.extname(actual).toLowerCase()]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   if(req.method==='HEAD')res.end();else fs.createReadStream(actual).pipe(res);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('文件不存在，请检查模型是否已经生成。');}
 });
 server.on('error',e=>{log('server-error '+e.message);process.exit(1);});
 server.listen(port,'127.0.0.1',()=>{fs.writeFileSync(STATE,JSON.stringify({app,id:ID,port,pid:process.pid,root:ROOT,token,started_at:new Date().toISOString()},null,2),'utf8');log('listening 127.0.0.1:'+port);});
 process.on('SIGINT',()=>server.close(()=>process.exit(0)));
}
async function launch(){
 if(process.argv[2]==='--serve'){const p=Number(process.argv[3]);if(p<4192||p>4201)throw Error('Invalid port');serve(p);return;}
 if(process.argv[2]==='--stop'){
  if(!fs.existsSync(STATE)){console.log('没有本入口启动的服务。');return;}
  const s=JSON.parse(fs.readFileSync(STATE,'utf8'));
  if(!await identity(s.port)){console.log('此项目的预览服务已经停止。');return;}
  const stopped=await request(s.port,'/__guangyin_3d_stop','POST',s.token);if(!stopped?.stopped)throw Error('服务拒绝停止请求；未终止其他进程。');console.log('本项目预览服务已停止。');return;
 }
 if(process.argv[2])throw Error('支持：不带参数启动，或 --stop 停止本项目预览。');
 if(!fs.existsSync(path.join(ROOT,'showcase/index.html')))throw Error('缺少showcase/index.html，请在完整仓库中运行此入口。');
 let port;
 for(let p=4192;p<=4201;p++){if(await identity(p)){port=p;break;}}
 if(!port){
  for(let p=4192;p<=4201;p++){if(await available(p)){port=p;break;}}
  if(!port)throw Error('4192–4201端口均被占用；没有终止或接管其他服务。');
  const child=cp.spawn(process.execPath,[__filename,'--serve',String(port)],{cwd:ROOT,detached:true,windowsHide:true,stdio:'ignore'});child.unref();
  let ready=false;for(let i=0;i<30;i++){if(await identity(port)){ready=true;break;}await new Promise(r=>setTimeout(r,150));}
  if(!ready)throw Error('HTTP服务未就绪。日志：'+LOG);
 }
 const url=`http://127.0.0.1:${port}/showcase/#structure`;
 console.log('三维预览已就绪：'+url);console.log('仅监听127.0.0.1，不调用Blender或FDTD。');console.log('日志：'+LOG);console.log('停止方式：再次运行“启动三维预览.cmd --stop”。');openBrowser(url);
}
launch().catch(e=>{log('launcher-error '+e.stack);console.error('启动失败：'+e.message);process.exitCode=1;});
