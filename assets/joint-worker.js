'use strict';
self.window=self;
importScripts('engine.js','model-data.js','joint-engine.js','research-engine.js');
const O=self.Optics,J=self.JointOptics,D=self.MODEL_DATA;
let queue=Promise.resolve(),frame=null,frameIndex=null,frameID=null;
self.onmessage=({data:q})=>{queue=queue.then(()=>execute(q)).catch(e=>self.postMessage({id:q.id,error:e.message}));};
async function execute(q){
 const progress=(value,partial)=>self.postMessage({id:q.id,progress:value,partial});let result;
 if(q.type==='render'){
  const current=O.infer(D,{...q.rx,phaseError:q.phaseError,seed:20261013});result={target:D.targets[q.index].flat(),current:Array.from(current.intensity),metrics:O.metrics(current.intensity,D.targets[q.index]),best:D.keys.map((k,i)=>({symbol:k.symbol,ncc:O.metrics(current.intensity,D.targets[i]).ncc})).sort((a,b)=>b.ncc-a.ncc)[0]};
 }else if(q.type==='encrypt'){
  const seed=crypto.getRandomValues(new Uint32Array(1))[0];frame=J.prepareFrame(D,{...J.channel(D,q.index),phaseError:q.phaseError},q.text,q.snr,seed);frameIndex=q.index;
  const bytes=new Uint8Array(frame.measured.reduce((s,p)=>s+p.r.byteLength+p.i.byteLength,0));let off=0;for(const p of frame.measured)for(const a of [p.r,p.i]){bytes.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),off);off+=a.byteLength;}
  frameID=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');result={frameID,seed,tx:frame.tx,payloadBytes:frame.payloadBytes,packetBits:frame.packetBits,snr:q.snr,cipherIntensity:frame.cipherIntensity,power:frame.power};
 }else if(q.type==='decrypt'){
  if(!frame||q.frameID!==frameID)throw Error('请先生成本次通信密文。');result={...await J.decodeFrame(D,frame,q.rx,progress),frameID};delete result.bits;
 }else if(q.type==='audit'){
  if(!frame||q.frameID!==frameID)throw Error('请先生成通信密文再做消融对照。');result={...await J.audit(D,frame,frameIndex,progress),frameID};
 }else if(q.type==='calibrate'){
  if(!frame||q.frameID!==frameID)throw Error('请先生成带有公开导频的通信密文。');result={...await J.calibrate(D,frame.pilot,frame.pilotSymbols,q.rx,q.window,progress),frameID};
 }else if(q.type==='tolerance')result=await J.tolerance(D,q.index,q.rx,q.phaseError,progress);
 else if(q.type==='sensitivity')result=self.ResearchOptics.sensitivity(D,q.rx);
 else if(q.type==='public-attack'){
  if(!frame||q.frameID!==frameID)throw Error('请先生成通信密文。');
  result={...await self.ResearchOptics.publicModelAttack(D,frame.measured,frame.pilot,frame.pilotSymbols,progress),frameID};
 }else if(q.type==='trials')result=await self.ResearchOptics.repeatedTrials(D,q.index,q.config,progress);
 else throw Error('未知计算请求');
 self.postMessage({id:q.id,result});
}
