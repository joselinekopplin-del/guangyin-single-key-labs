/* THz library-driven propagation. Historical 532 nm operators remain unchanged.
   Time: exp(-iwt). Coordinates: array rows increase in physical +y, columns +x.
   This is a transverse one-way Jones/ASM approximation, not three-layer FDTD. */
(function(root){
'use strict';
const O=root.Optics||(typeof require==='function'?require('./engine.js'):null);
const TA=Float64Array,rad=d=>d*Math.PI/180;
const impulseCache=new Map();
function complex(n){return {r:new TA(n),i:new TA(n)};}
function copy(a){return {r:TA.from(a.r),i:TA.from(a.i)};}
function kernel(m,dx,wl,z){
 const h=complex(m*m);
 for(let y=0;y<m;y++)for(let x=0;x<m;x++){
  const fx=(x<m/2?x:x-m)/(m*dx),fy=(y<m/2?y:y-m)/(m*dx),q=1-wl*wl*(fx*fx+fy*fy),j=y*m+x;
  if(q>=0){const phase=2*Math.PI*z/wl*Math.sqrt(q);h.r[j]=Math.cos(phase);h.i[j]=Math.sin(phase);}
 }return h;
}
function propagate(v,h,m){const a=copy(v);O.fft2(a,m);for(let j=0;j<a.r.length;j++){const r=a.r[j],i=a.i[j];a.r[j]=r*h.r[j]-i*h.i[j];a.i[j]=r*h.i[j]+i*h.r[j];}O.fft2(a,m,true);return a;}
function impulse(grid,dx,wl,z){const k=[grid,dx,wl,z].join('|');if(impulseCache.has(k))return impulseCache.get(k);const h=kernel(grid,dx,wl,z);O.fft2(h,grid,true);if(impulseCache.size>7)impulseCache.clear();impulseCache.set(k,h);return h;}
function cropConvolve(v,h,grid,m){
 // Exact discrete circular convolution on the configured large FFT grid.
 // Sources are zero outside finite rotated pupils; outputs are the detector crop.
 // No additional truncation is applied to fields before a physical pupil.
 const out=complex(m*m),support=[];
 for(let y=0;y<m;y++)for(let x=0;x<m;x++){const i=y*m+x;if(v.r[i]!==0||v.i[i]!==0)support.push([y,x,v.r[i],v.i[i]]);}
 for(const [sy,sx,sr,si] of support)for(let y=0;y<m;y++){const row=((y-sy+grid)%grid)*grid;for(let x=0;x<m;x++){const j=row+(x-sx+grid)%grid,i=y*m+x;out.r[i]+=sr*h.r[j]-si*h.i[j];out.i[i]+=sr*h.i[j]+si*h.r[j];}}
 return out;
}
function pairsFromLibrary(library){return library.records.map(r=>['x','y'].map(p=>[r.responses[p].t_real,r.responses[p].t_imag]));}
function makeOperator(config,pairs,design,key,variant='C'){
 const s=config.system,n=s.cells_per_axis,grid=s.fft_size,m=s.detector_size||grid,dx=s.sample_pitch_m,off=(m-n)/2;
 if(!Number.isInteger(off)||n%4||m&(m-1))throw Error('传播网格必须为2的幂，孔径/网格须同奇偶，码元分组须整除。');
 const maps=[];
 for(let l=0;l<3;l++){
  const theta=l===1?key.theta_deg:0,c=Math.cos(rad(theta)),sn=Math.sin(rad(theta)),beta=rad(theta+s.local_pillar_orientation_deg),cb=Math.cos(beta),sb=Math.sin(beta);
  const js=Array.from({length:3},()=>complex(m*m)); // Jxx, Jxy=Jyx, Jyy
  for(let y=0;y<m;y++)for(let x=0;x<m;x++){
   const xx=(x-(m-1)/2),yy=(y-(m-1)/2),sx=c*xx+sn*yy+(n-1)/2,sy=-sn*xx+c*yy+(n-1)/2;
   if(sx<-.5||sx>=n-.5||sy<-.5||sy>=n-.5)continue;
   const ix=Math.max(0,Math.min(n-1,Math.floor(sx+.5))),iy=Math.max(0,Math.min(n-1,Math.floor(sy+.5))),j=y*m+x;
   let tx,ty;
   if(variant==='A'){const px=design.ideal_phase[l][0][iy][ix],py=design.ideal_phase[l][1][iy][ix];tx=[Math.cos(px),Math.sin(px)];ty=[Math.cos(py),Math.sin(py)];}
   else [tx,ty]=pairs[design['geometry_'+variant][l][iy][ix]];
   for(let k=0;k<2;k++){const a=cb*cb*tx[k]+sb*sb*ty[k],b=cb*sb*(tx[k]-ty[k]),d=sb*sb*tx[k]+cb*cb*ty[k];js[0][k?'i':'r'][j]=a;js[1][k?'i':'r'][j]=b;js[2][k?'i':'r'][j]=d;}
  }maps.push(js);
 }
 const hs=[s.d12_m,key.d23_m,s.d3_detector_m].map(d=>grid===m?kernel(m,dx,config.wavelength_m,d):impulse(grid,dx,config.wavelength_m,d));
 function input(symbols){const e=[complex(m*m),complex(m*m)],p=[Math.cos(rad(key.alpha_deg)),Math.sin(rad(key.alpha_deg))];for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=symbols[Math.floor(y/(n/4))*4+Math.floor(x/(n/4))]/n;for(let a=0;a<2;a++)e[a].r[(y+off)*m+x+off]=p[a]*v;}return e;}
 function apply(e,j){const out=[complex(m*m),complex(m*m)];for(let a=0;a<2;a++)for(let b=0;b<2;b++){const t=j[a+b];for(let k=0;k<m*m;k++){out[a].r[k]+=t.r[k]*e[b].r[k]-t.i[k]*e[b].i[k];out[a].i[k]+=t.r[k]*e[b].i[k]+t.i[k]*e[b].r[k];}}return out;}
 function forward(symbols,trace=false){let e=input(symbols);const start=e.map(copy),after=[],prop=[];for(let l=0;l<3;l++){e=apply(e,maps[l]);if(trace)after.push(e.map(copy));e=e.map(v=>grid===m?propagate(v,hs[l],m):cropConvolve(v,hs[l],grid,m));if(trace)prop.push(e.map(copy));}return trace?{input:start,after,propagated:prop,final:e}:e;}
 return {forward,m,n};
}
function power(e){let t=0;for(const a of e)for(let i=0;i<a.r.length;i++)t+=a.r[i]**2+a.i[i]**2;return t;}
function overlap(a,b){let r=0,i=0;for(let p=0;p<2;p++)for(let j=0;j<a[p].r.length;j++){r+=a[p].r[j]*b[p].r[j]+a[p].i[j]*b[p].i[j];i+=a[p].r[j]*b[p].i[j]-a[p].i[j]*b[p].r[j];}const den=power(a);return {gain:[r/den,i/den],score:(r*r+i*i)/(den*power(b))};}
function dot(a,b){let r=0;for(let p=0;p<2;p++)for(let j=0;j<a[p].r.length;j++)r+=a[p].r[j]*b[p].r[j]+a[p].i[j]*b[p].i[j];return r;}
function solve(matrix,rhs){ // small full-rank real least-squares normal system; rank loss is explicit.
 const a=matrix.map((r,i)=>[...r,rhs[i]]),n=rhs.length,scale=Math.max(...a.map(r=>Math.max(...r.slice(0,n).map(Math.abs))));
 for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;
  if(Math.abs(a[p][c])<scale*1e-13)throw Error('接收矩阵病态；网页求逆未通过，不以预计算答案替代。');[a[c],a[p]]=[a[p],a[c]];const v=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=v;
  for(let r=0;r<n;r++)if(r!==c){const v=a[r][c];for(let j=c;j<=n;j++)a[r][j]-=v*a[c][j];}
 }return a.map(r=>r[n]);
}
function receive(config,pairs,design,signal,candidate,variant='C'){
 const op=makeOperator(config,pairs,design,candidate,variant),columns=Array.from({length:16},(_,i)=>op.forward(Array.from({length:16},(_,j)=>+(j===i)))),gram=columns.map(a=>columns.map(b=>dot(a,b))),fit=overlap(op.forward(signal.pilot_symbols),signal.pilot);
 let [gr,gi]=fit.gain,g2=gr*gr+gi*gi;const rawGain=Math.sqrt(g2),unobservable=rawGain<1e-12;if(unobservable){gr=1;gi=0;g2=1;}
 const soft=[];
 for(const f of signal.measured){const y=f.map(p=>({r:TA.from(p.r,(v,i)=>(v*gr+p.i[i]*gi)/g2),i:TA.from(p.i,(v,i)=>(v*gr-p.r[i]*gi)/g2)})),values=solve(gram,columns.map(a=>dot(a,y)));soft.push(...values);}
 // Numeric erasure, independent of candidate identity and evaluator truth.
 // A vanishing real BPSK estimate cannot acquire a bit from a rounding sign.
 const threshold=1e-12,erasure=soft.map(v=>unobservable||Math.abs(v)<threshold),count=erasure.filter(Boolean).length,bits=soft.map((v,i)=>erasure[i]?0:+(v>0));
 const bytes=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=v*2+bits[i+j];bytes.push(v);}
 const len=bytes[0]*256+bytes[1];let decoded=null,crcValid=false;
 if(len>=1&&len<=122&&bytes.length>=len+6){const data=Uint8Array.from(bytes.slice(2,2+len)),j=2+len,crc=((bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3])>>>0;crcValid=O.crc32(data)===crc;try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{}}
 if(count){decoded=null;crcValid=false;}
 return {bits,soft_symbols:soft,erasure_mask:erasure,erasure_count:count,decision_threshold:threshold,pilot_gain_abs_raw:rawGain,carrier_gain_unobservable:unobservable,received_no_decision:count>0,decoded,crc_valid:crcValid,pilot_score:fit.score,candidate,cipher_sha256:signal.cipher_sha256};
}
async function calibrate(config,pairs,design,publicSignal,initial,variant='C',window=[3,3,.0003],rounds=4,onProgress=null){
 // Same ordered local search as Python calibrate; only a measured public pilot is scored.
 // UI progress yields do not alter candidates, search window or the saved ciphertext.
 const names=['alpha_deg','theta_deg','d23_m'];let best={...initial},count=0;
 if(!names.every(k=>Number.isFinite(initial[k]))||window.length!==3||!window.every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(rounds)||rounds<1)throw Error('校准参数无效');
 function score(k){count++;const pred=makeOperator(config,pairs,design,k,variant).forward(publicSignal.pilot_symbols),v=overlap(pred,publicSignal.pilot).score;return Number.isFinite(v)?v:0;}
 let value=score(best);const initialScore=value,started=Date.now();
 const update=async round=>{if(onProgress)onProgress({round:round+1,rounds,evaluations:count,pilot_score:value,estimated:{...best},elapsed_seconds:(Date.now()-started)/1000});await new Promise(resolve=>setTimeout(resolve,0));};
 for(let r=0;r<rounds;r++){
  const center={...best};
  for(const a of [-1,0,1])for(const t of [-1,0,1])for(const d of [-1,0,1]){
   const candidate={alpha_deg:center.alpha_deg+a*window[0]/2**r,theta_deg:center.theta_deg+t*window[1]/2**r,d23_m:center.d23_m+d*window[2]/2**r};
   if(names.some((p,i)=>Math.abs(candidate[p]-initial[p])>window[i]+1e-12)||candidate.d23_m<.001)continue;
   const s=score(candidate);if(s>value){best=candidate;value=s;}
   await update(r);
  }
 }
 return {estimated:best,pilot_score:value,initial_score:initialScore,evaluations:count,information:'known public pilot only; no plaintext or true key',window:[...window],rounds,elapsed_seconds:(Date.now()-started)/1000};
}
const api={kernel,makeOperator,pairsFromLibrary,power,overlap,receive,calibrate};root.THzOptics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
