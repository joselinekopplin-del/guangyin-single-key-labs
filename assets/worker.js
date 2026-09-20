'use strict';
self.window=self;
importScripts('engine.js','model-data.js','config.js');
const O=self.Optics,D=self.MODEL_DATA,C=self.LabConfig;
let queue=Promise.resolve();
self.onmessage=({data:q})=>{queue=queue.then(()=>execute(q)).catch(e=>self.postMessage({id:q.id,error:e.message}));};
async function execute(q){
  const {id,type,mode,value,keyIndex}=q,config=C.labs[mode];
  if(!config||!config.keys.includes(keyIndex))throw Error('所选通道不属于当前实验');
  const key=D.keys[keyIndex],referenceValue=C.keyValue(mode,key),tx=C.options(mode,referenceValue),rx=C.options(mode,value);
  if(type==='render'){
    const reference=O.infer(D,tx),current=O.infer(D,rx),wrongOptions=C.options(mode,C.wrongValue(mode,referenceValue)),wrong=O.infer(D,wrongOptions);
    const similarity=config.keys.map(i=>({symbol:D.keys[i].symbol,ncc:O.metrics(current.intensity,D.targets[i]).ncc}));
    self.postMessage({id,result:{target:D.targets[keyIndex].flat(),reference:Array.from(reference.intensity),current:Array.from(current.intensity),wrong:Array.from(wrong.intensity),metrics:O.metrics(current.intensity,D.targets[keyIndex]),wrongMetrics:O.metrics(wrong.intensity,D.targets[keyIndex]),power:current.power,similarity,rx,tx,wrongOptions,stages:current.stages.map(a=>Array.from(a))}});
  }else if(type==='communicate'){
    const result=await O.coherentCommunicate(D,tx,rx,q.text,'utf8',q.snr,20260920,100,step=>self.postMessage({id,progress:step/16}));
    self.postMessage({id,result:{...result,tx,rx,mode,snr:q.snr,sent:q.text}});
  }else if(type==='scan'){
    const rows=[];for(let v=config.min;v<=config.max+1e-6;v+=config.scanStep){
      const actual=Number(v.toFixed(3)),p=C.options(mode,actual),r=O.infer(D,p),m=O.metrics(r.intensity,D.targets[keyIndex]);
      rows.push({value:actual,...m});self.postMessage({id,progress:(v-config.min)/(config.max-config.min),rows});
    }
    self.postMessage({id,result:{rows,mode,keyIndex,referenceValue,fixed:tx}});
  }else throw Error('未知计算请求');
}
