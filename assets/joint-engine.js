/* Joint-key experiment extensions. Numerical diagnostics, not a cryptographic primitive. */
(function(root){
'use strict';
const O=root.Optics||(typeof require==='function'?require('./engine.js'):null),TA=Float64Array;
const wrap=(v,p)=>((v%p)+p)%p;
function key(alpha=90,angle=90,z=10){return {pol:'H',polError:wrap(Number(alpha),180),angle:wrap(Number(angle),360),z:Number(z),wavelength:532,phaseError:0,seed:20261013};}
function channel(data,index){const k=data.keys[index];if(!k)throw Error('未知联合通道');return key(k.pol*90,k.angle,k.z*1000);}
function keyText(k){return `${k.polError.toFixed(2)}° / ${k.angle.toFixed(2)}° / ${k.z.toFixed(3)} mm`;}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const bitsBytes=bits=>{const out=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=v*2+(bits[i+j]||0);out.push(v);}return out;};
function fieldPower(f){return f.reduce((s,p)=>s+dot(p.r,p.r)+dot(p.i,p.i),0);}
function fieldIntensity(f){return TA.from(f[0].r,(v,i)=>v*v+f[0].i[i]**2+f[1].r[i]**2+f[1].i[i]**2);}
function addNoise(field,snr,random){const sigma=Math.sqrt(fieldPower(field)/(4*field[0].r.length)*10**(-snr/10));return {sigma,field:field.map(p=>({r:TA.from(p.r,v=>v+sigma*O.gaussian(random)),i:TA.from(p.i,v=>v+sigma*O.gaussian(random))}))};}
function overlap(predicted,observed){let re=0,im=0;for(let p=0;p<2;p++)for(let i=0;i<predicted[p].r.length;i++){const ar=predicted[p].r[i],ai=predicted[p].i[i],br=observed[p].r[i],bi=observed[p].i[i];re+=ar*br+ai*bi;im+=ar*bi-ai*br;}const a=fieldPower(predicted),b=fieldPower(observed);return {score:(re*re+im*im)/Math.max(1e-30,a*b),gainR:re/Math.max(a,1e-30),gainI:im/Math.max(a,1e-30)};}
function prepareFrame(data,tx,text,snr=30,seed=20261013){
 const payload=new TextEncoder().encode(text);if(!payload.length||payload.length>122)throw Error('请输入 1–122 个 UTF-8 字节的文字。');
 const crc=O.crc32(payload),packet=[payload.length>>8,payload.length&255,...payload,crc>>>24,(crc>>>16)&255,(crc>>>8)&255,crc&255];
 const active=packet.flatMap(v=>Array.from({length:8},(_,j)=>(v>>(7-j))&1)),random=O.rng(seed),bits=active.slice();while(bits.length<1024)bits.push(random()>.5?1:0);
 const symbols=TA.from(bits,v=>2*v-1),operator=O.coherentOperator(data,tx),clean=operator.forward(symbols),noise=addNoise(clean,snr,random);
 const pilotRandom=O.rng(20261013),pilotSymbols=TA.from({length:1024},()=>pilotRandom()>.5?1:-1),pilot=addNoise(operator.forward(pilotSymbols),snr,random).field;
 return {measured:noise.field,pilot,pilotSymbols,active,tx:{...tx},text,payloadBytes:payload.length,seed,snr,sigma:noise.sigma,packetBits:active.length,frameBits:1024,cipherIntensity:Array.from(O.crop(fieldIntensity(noise.field),data.grid,data.n)),power:fieldPower(clean)};
}
async function solve(data,measured,pilot,pilotSymbols,rx,onProgress=()=>{}){
 const op=O.coherentOperator(data,rx),pilotFit=overlap(op.forward(pilotSymbols),pilot),g2=pilotFit.gainR**2+pilotFit.gainI**2;
 // A public pilot estimates a common complex carrier gain. It is not a secret key.
 const corrected=measured.map(p=>({r:TA.from(p.r,(v,i)=>g2>1e-16?(v*pilotFit.gainR+p.i[i]*pilotFit.gainI)/g2:v),i:TA.from(p.i,(v,i)=>g2>1e-16?(v*pilotFit.gainR-p.r[i]*pilotFit.gainI)/g2:v)}));
 const b=op.adjoint(corrected),x=new TA(1024),res=TA.from(b),direction=TA.from(b),history=[];let rr=dot(res,res);
 for(let iter=0;iter<16;iter++){
  const ap=op.adjoint(op.forward(direction));for(let i=0;i<1024;i++)ap[i]+=1e-6*direction[i];const den=dot(direction,ap);if(den<1e-30||rr<1e-24)break;
  const a=rr/den;for(let i=0;i<1024;i++){x[i]+=a*direction[i];res[i]-=a*ap[i];}const next=dot(res,res),beta=next/rr;for(let i=0;i<1024;i++)direction[i]=res[i]+beta*direction[i];rr=next;history.push(Math.sqrt(rr));onProgress((iter+1)/16);await new Promise(r=>setTimeout(r,0));
 }
 const bits=Array.from(x,v=>v>0?1:0),bytes=bitsBytes(bits),length=bytes[0]*256+bytes[1];let decoded='帧头无法解析',crcValid=false;
 if(length>0&&length<=122){const payload=Uint8Array.from(bytes.slice(2,2+length)),end=2+length,crc=((bytes[end]<<24)|(bytes[end+1]<<16)|(bytes[end+2]<<8)|bytes[end+3])>>>0;decoded=new TextDecoder().decode(payload);crcValid=O.crc32(payload)===crc;}
 return {bits,decoded,crcValid,iterations:history.length,residualHistory:history,pilotScore:pilotFit.score,rx:{...rx}};
}
async function decodeFrame(data,frame,rx,onProgress){const r=await solve(data,frame.measured,frame.pilot,frame.pilotSymbols,rx,onProgress);const errors=frame.active.reduce((s,v,i)=>s+(v!==r.bits[i]),0);return {...r,received:r.bits.slice(0,frame.packetBits),errors,ber:errors/frame.packetBits,packetBits:frame.packetBits,payloadBytes:frame.payloadBytes,correct:r.crcValid&&r.decoded===frame.text};}
async function calibrate(data,pilot,pilotSymbols,initial,window={alpha:3,angle:2,z:.2},onProgress=()=>{}){
 const evaluate=k=>overlap(O.coherentOperator(data,k).forward(pilotSymbols),pilot).score;
 let best={...initial,phaseError:0},score=evaluate(best),initialScore=score,count=1;
 const distance=(a,b,p)=>Math.abs(wrap(a-b+p/2,p)-p/2),inBounds=k=>distance(k.polError,initial.polError,180)<=window.alpha+1e-8&&distance(k.angle,initial.angle,360)<=window.angle+1e-8&&Math.abs(k.z-initial.z)<=window.z+1e-8;
 for(let round=0;round<5;round++){
  const center={...best},factor=2**(-round);
  for(const a of [-1,0,1])for(const t of [-1,0,1])for(const d of [-1,0,1]){
   const k=key(center.polError+a*window.alpha*factor,center.angle+t*window.angle*factor,center.z+d*window.z*factor);if(k.z<4||k.z>12||!inBounds(k))continue;
   const s=evaluate(k);count++;if(s>score){best=k;score=s;}
  }
  onProgress((round+1)/5,{estimated:best,score,count});await new Promise(r=>setTimeout(r,0));
 }
 return {estimated:best,score,initialScore,count,window,initial:{...initial},method:'public-pilot normalized complex correlation; bounded 3-D search, 5 refinement rounds'};
}
function altered(tx,mask){return key(mask&1?tx.polError+90:tx.polError,mask&2?tx.angle+90:tx.angle,mask&4?(Math.abs(tx.z-6)<1?10:6):tx.z);}
async function audit(data,frame,index,onProgress=()=>{}){
 const names=['全部正确','仅偏振错误','仅转角错误','偏振与转角错误','仅层距错误','偏振与层距错误','转角与层距错误','三项均错误'],rows=[];
 for(let mask=0;mask<8;mask++){const rx=altered(frame.tx,mask),r=await decodeFrame(data,frame,rx),image=O.infer(data,{...rx,phaseError:frame.tx.phaseError,seed:frame.tx.seed});rows.push({mask,name:names[mask],rx,ncc:O.metrics(image.intensity,data.targets[index]).ncc,ber:r.ber,crcValid:r.crcValid,pilotScore:r.pilotScore,decoded:r.decoded});onProgress((mask+1)/8,rows);}
 return {rows,seed:frame.seed,packetBits:frame.packetBits};
}
async function tolerance(data,index,center,phaseError=0,onProgress=()=>{}){
 const points=[],size=9;for(let y=0;y<size;y++){for(let x=0;x<size;x++){const theta=center.angle+(x-4),z=center.z+(y-4)*.1,k=key(center.polError,theta,z);const out=O.infer(data,{...k,phaseError,seed:20261013});points.push({alpha:k.polError,angle:theta,z,ncc:O.metrics(out.intensity,data.targets[index]).ncc});}onProgress((y+1)/size,points);await new Promise(r=>setTimeout(r,0));}
 return {points,size,center:{...center},threshold:.9,qualifying:points.filter(p=>p.ncc>=.9).length};
}
const api={key,channel,keyText,prepareFrame,decodeFrame,solve,calibrate,audit,tolerance,overlap,altered};root.JointOptics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
