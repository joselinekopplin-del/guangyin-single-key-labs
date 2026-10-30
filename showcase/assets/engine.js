/* Physical inference engine. No network, framework, or key-equality gate. */
(function(root){
'use strict';
const TA=Float64Array, PI=Math.PI;
function complex(n){return {r:new TA(n),i:new TA(n)};}
function fft1(r,i,inverse){
  const n=r.length;
  for(let a=1,b=0;a<n;a++){let bit=n>>1;for(;b&bit;bit>>=1)b^=bit;b^=bit;
    if(a<b){let t=r[a];r[a]=r[b];r[b]=t;t=i[a];i[a]=i[b];i[b]=t;}}
  for(let len=2;len<=n;len<<=1){const an=(inverse?2:-2)*PI/len,wr0=Math.cos(an),wi0=Math.sin(an);
    for(let st=0;st<n;st+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){
      const a=st+j,b=a+len/2,tr=wr*r[b]-wi*i[b],ti=wr*i[b]+wi*r[b],ur=r[a],ui=i[a];
      r[a]=ur+tr;i[a]=ui+ti;r[b]=ur-tr;i[b]=ui-ti;
      const t=wr;wr=t*wr0-wi*wi0;wi=t*wi0+wi*wr0;
    }}}
  if(inverse)for(let a=0;a<n;a++){r[a]/=n;i[a]/=n;}
}
function fft2(e,n,inverse=false){
  let r=new TA(n),i=new TA(n);
  for(let y=0;y<n;y++){r.set(e.r.subarray(y*n,(y+1)*n));i.set(e.i.subarray(y*n,(y+1)*n));fft1(r,i,inverse);e.r.set(r,y*n);e.i.set(i,y*n);}
  for(let x=0;x<n;x++){for(let y=0;y<n;y++){r[y]=e.r[y*n+x];i[y]=e.i[y*n+x];}fft1(r,i,inverse);for(let y=0;y<n;y++){e.r[y*n+x]=r[y];e.i[y*n+x]=i[y];}}
  return e;
}
const kernelCache=new Map();
function kernel(n,dx,wl,z){
  const key=[n,dx,wl,z].join(',');if(kernelCache.has(key))return kernelCache.get(key);
  let h=complex(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const fx=(x<n/2?x:x-n)/(n*dx),fy=(y<n/2?y:y-n)/(n*dx),q=wl*wl*(fx*fx+fy*fy),a=y*n+x;
    if(q<=1){const phase=2*PI*z/wl*(-q/(1+Math.sqrt(1-q)));h.r[a]=Math.cos(phase);h.i[a]=Math.sin(phase);}}
  if(kernelCache.size>90)kernelCache.clear();kernelCache.set(key,h);return h;
}
function propagate(e,h,n){
  fft2(e,n);for(let a=0;a<e.r.length;a++){const r=e.r[a],i=e.i[a];e.r[a]=r*h.r[a]-i*h.i[a];e.i[a]=r*h.i[a]+i*h.r[a];}return fft2(e,n,true);
}
function rng(seed=1){let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function gaussian(random){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*PI*random());}
function jones(pol,offset=0){
  let a;
  if(pol==='R')a=[[Math.SQRT1_2,0],[0,-Math.SQRT1_2]];
  else if(pol==='L')a=[[Math.SQRT1_2,0],[0,Math.SQRT1_2]];
  else {let p=(pol==='V'?90:pol==='D'?45:0)*PI/180;a=[[Math.cos(p),0],[Math.sin(p),0]];}
  let c=Math.cos(offset*PI/180),s=Math.sin(offset*PI/180);
  return [[c*a[0][0]-s*a[1][0],c*a[0][1]-s*a[1][1]],[s*a[0][0]+c*a[1][0],s*a[0][1]+c*a[1][1]]];
}
function mask(phases,angle,error,random,n){
  let src=phases.map(p=>{let t=complex(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let a=y*n+x,ph=p[y][x]+(error?error*gaussian(random):0);t.r[a]=Math.cos(ph);t.i[a]=Math.sin(ph);}return t;});
  let theta=angle*PI/180,c=Math.cos(theta),s=Math.sin(theta),mid=(n-1)/2;
  if(Math.abs(angle%360)<1e-9)return src;
  let out=[complex(n*n),complex(n*n)];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let sx=c*(x-mid)+s*(mid-y)+mid,sy=mid+s*(x-mid)-c*(mid-y);
    if(Math.abs(sx-Math.round(sx))<1e-10)sx=Math.round(sx);if(Math.abs(sy-Math.round(sy))<1e-10)sy=Math.round(sy);
    let x0=Math.floor(sx),y0=Math.floor(sy),a=y*n+x;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){
      let xx=x0+ox,yy=y0+oy;if(xx<0||xx>=n||yy<0||yy>=n)continue;
      let w=(1-Math.abs(sx-xx))*(1-Math.abs(sy-yy)),b=yy*n+xx;
      for(let p=0;p<2;p++){out[p].r[a]+=src[p].r[b]*w;out[p].i[a]+=src[p].i[b]*w;}
    }}return out;
}
function intensity(e){let t=new TA(e[0].r.length);for(let a=0;a<t.length;a++)for(let p=0;p<2;p++)t[a]+=e[p].r[a]**2+e[p].i[a]**2;return t;}
function crop(a,m,n){let out=new TA(n*n),off=(m-n)/2;for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[y*n+x]=a[(y+off)*m+x+off];return out;}
function infer(data,options={}){
  const {n,grid:m,dx}=data,wl=(options.wavelength||532)*1e-9,angle=options.angle||0,z=(options.z||6)*1e-3;
  const pol=options.pol||'H',j=jones(pol,options.polError||0),random=rng(options.seed||1),off=(m-n)/2;
  let e=[complex(m*m),complex(m*m)],norm=0,amp=new TA(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*n+x;amp[a]=Math.exp(-((x-(n-1)/2)**2+(y-(n-1)/2)**2)/(2*17**2));norm+=amp[a]**2;}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let p=0;p<2;p++){
    const a=(y+off)*m+x+off,v=amp[y*n+x]/Math.sqrt(norm);e[p].r[a]=v*j[p][0];e[p].i[a]=v*j[p][1];}
  let stages=[];
  for(let l=0;l<3;l++){
    const theta=(l===1?angle:0)*PI/180,c=Math.cos(theta),s=Math.sin(theta);
    const t=mask(data.phases[l],l===1?angle:0,options.phaseError||0,random,n),plane=[complex(m*m),complex(m*m)];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const a=(y+off)*m+x+off,b=y*n+x;
      const xr=c*e[0].r[a]+s*e[1].r[a],xi=c*e[0].i[a]+s*e[1].i[a],yr=-s*e[0].r[a]+c*e[1].r[a],yi=-s*e[0].i[a]+c*e[1].i[a];
      const ur=xr*t[0].r[b]-xi*t[0].i[b],ui=xr*t[0].i[b]+xi*t[0].r[b],vr=yr*t[1].r[b]-yi*t[1].i[b],vi=yr*t[1].i[b]+yi*t[1].r[b];
      plane[0].r[a]=c*ur-s*vr;plane[0].i[a]=c*ui-s*vi;plane[1].r[a]=s*ur+c*vr;plane[1].i[a]=s*ui+c*vi;
    }
    const h=kernel(m,dx,wl,l===1?z:.004);e=plane.map(a=>propagate(a,h,m));stages.push(crop(intensity(e),m,n));
  }
  let full=intensity(e),power=full.reduce((s,x)=>s+x,0),out=crop(full,m,n);
  return {intensity:out,full,power,stages,options:{...options},inputPower:1};
}
/* Spatial BPSK coherent link. A maps 32x32 real symbols through finite pupils.
   Its exact adjoint reverses propagation and applies conjugate Jones masks.
   Conjugate gradient solves (Re A* A + lambda I)x = Re A* measuredField.
   This is a digital coherent receiver, not a demonstrated all-optical inverse. */
function coherentOperator(data,options){
  const {n,grid:m,dx}=data,off=(m-n)/2,j=jones(options.pol||'H',options.polError||0),random=rng(options.seed||1);
  const ts=[],hs=[],cs=[],ss=[];
  for(let l=0;l<3;l++){let a=l===1?options.angle||0:0;ts.push(mask(data.phases[l],a,options.phaseError||0,random,n));cs.push(Math.cos(a*PI/180));ss.push(Math.sin(a*PI/180));hs.push(kernel(m,dx,(options.wavelength||532)*1e-9,l===1?(options.z||6)*1e-3:.004));}
  function apply(e,l,adjoint){
    const plane=[complex(m*m),complex(m*m)],c=cs[l],s=ss[l],t=ts[l],sg=adjoint?-1:1;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const a=(y+off)*m+x+off,b=y*n+x,xr=c*e[0].r[a]+s*e[1].r[a],xi=c*e[0].i[a]+s*e[1].i[a],yr=-s*e[0].r[a]+c*e[1].r[a],yi=-s*e[0].i[a]+c*e[1].i[a];
      const ur=xr*t[0].r[b]-sg*xi*t[0].i[b],ui=sg*xr*t[0].i[b]+xi*t[0].r[b],vr=yr*t[1].r[b]-sg*yi*t[1].i[b],vi=sg*yr*t[1].i[b]+yi*t[1].r[b];
      plane[0].r[a]=c*ur-s*vr;plane[0].i[a]=c*ui-s*vi;plane[1].r[a]=s*ur+c*vr;plane[1].i[a]=s*ui+c*vi;
    }return plane;
  }
  function forward(symbols){
    let e=[complex(m*m),complex(m*m)];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const a=(y+off)*m+x+off,b=(y>>1)*32+(x>>1),v=symbols[b]/n;
      for(let p=0;p<2;p++){e[p].r[a]=v*j[p][0];e[p].i[a]=v*j[p][1];}}
    for(let l=0;l<3;l++)e=apply(e,l,false).map(v=>propagate(v,hs[l],m));return e;
  }
  function adjoint(field){
    let e=field.map(v=>({r:TA.from(v.r),i:TA.from(v.i)}));
    for(let l=2;l>=0;l--){let h={r:hs[l].r,i:TA.from(hs[l].i,v=>-v)};e=e.map(v=>propagate(v,h,m));e=apply(e,l,true);}
    let out=new TA(1024);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      let a=(y+off)*m+x+off,b=(y>>1)*32+(x>>1);for(let p=0;p<2;p++)out[b]+=(e[p].r[a]*j[p][0]+e[p].i[a]*j[p][1])/n;
    }return out;
  }return {forward,adjoint};
}
function crc32(bytes){let crc=0xffffffff;for(let byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function bytesBits(bytes){let out=[];for(let byte of bytes)for(let k=7;k>=0;k--)out.push((byte>>k)&1);return out;}
function bitsBytes(bits){let a=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let k=0;k<8;k++)b=(b<<1)|(bits[i+k]||0);a.push(b);}return a;}
async function coherentCommunicate(data,txOptions,rxOptions,text,mode,snr,seed,rate,onProgress=()=>{}){
  let expected=text,code='',payload;
  if(mode==='morse'){let m=encodeMorse(text);expected=m.expected;code=m.code;payload=new TextEncoder().encode(code);}else payload=new TextEncoder().encode(text);
  if(!payload.length)throw Error('请输入要发送的信息。');
  if(payload.length>122)throw Error(mode==='morse'?'单帧最多 122 个摩斯符号及间隔字符，请缩短消息。':'单帧最多 122 个 UTF-8 字节，请缩短消息（约 40 个汉字）。');
  let crc=crc32(payload),packet=[payload.length>>8,payload.length&255,...payload,crc>>>24,(crc>>>16)&255,(crc>>>8)&255,crc&255];
  let active=bytesBits(packet),random=rng(seed),bits=active.slice();while(bits.length<1024)bits.push(random()>.5?1:0);
  const symbols=TA.from(bits,b=>2*b-1),tx=coherentOperator(data,txOptions),rx=coherentOperator(data,rxOptions),clean=tx.forward(symbols),power=intensity(clean).reduce((s,x)=>s+x,0);
  const sigma=Math.sqrt(power/(4*data.grid**2)*Math.pow(10,-snr/10));
  const measured=clean.map(e=>({r:TA.from(e.r,v=>v+sigma*gaussian(random)),i:TA.from(e.i,v=>v+sigma*gaussian(random))}));
  const b=rx.adjoint(measured),lambda=1e-6,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),x=new TA(1024);
  let residual=TA.from(b),p=TA.from(b),rr=dot(residual,residual),history=[];
  for(let iter=0;iter<16;iter++){
    let ap=rx.adjoint(rx.forward(p));for(let i=0;i<1024;i++)ap[i]+=lambda*p[i];let den=dot(p,ap);if(den<1e-30||rr<1e-24)break;
    let alpha=rr/den;for(let i=0;i<1024;i++){x[i]+=alpha*p[i];residual[i]-=alpha*ap[i];}
    let next=dot(residual,residual),beta=next/rr;for(let i=0;i<1024;i++)p[i]=residual[i]+beta*p[i];rr=next;history.push(Math.sqrt(rr));onProgress(iter+1);await new Promise(r=>setTimeout(r,0));
  }
  const received=Array.from(x,v=>v>0?1:0),bytes=bitsBytes(received),length=bytes[0]*256+bytes[1];
  let decoded='',crcValid=false;
  if(length>0&&length<=122){let rxPayload=Uint8Array.from(bytes.slice(2,2+length)),end=2+length,expectedCRC=((bytes[end]<<24)|(bytes[end+1]<<16)|(bytes[end+2]<<8)|bytes[end+3])>>>0;crcValid=crc32(rxPayload)===expectedCRC;
    if(mode==='morse'){let reverse=Object.fromEntries(Object.entries(morse).map(([k,v])=>[v,k]));decoded=new TextDecoder().decode(rxPayload).split(' ').map(t=>t==='/'?' ':reverse[t]||'�').join('');}else decoded=new TextDecoder().decode(rxPayload);
  }else decoded='帧头无法解析';
  let errors=active.reduce((s,b,i)=>s+(b!==received[i]),0),gain=dot(symbols,x)/1024;
  let recoveredImage=new TA(data.n**2);for(let y=0;y<data.n;y++)for(let xx=0;xx<data.n;xx++)recoveredImage[y*data.n+xx]=Math.max(0,Math.min(1,(x[(y>>1)*32+(xx>>1)]+1)/2));
  return {bits:active,received:received.slice(0,active.length),samples:Array.from(x.slice(0,active.length),v=>(v+1)/2),errors,ber:errors/active.length,decoded,expected,code,gain,sigma,snr,seed,rate,duration:active.length/rate,correct:crcValid&&decoded===expected,crcValid,payloadBytes:payload.length,packetBits:active.length,frameBits:1024,iterations:history.length,residualHistory:history,cipherIntensity:Array.from(crop(intensity(clean),data.grid,data.n)),recoveredImage:Array.from(recoveredImage),power};
}
function flatten(t){return t instanceof TA?t:TA.from(t.flat());}
function metrics(i,t){
  t=flatten(t);let sa=0,sb=0,aa=0,bb=0,ab=0,peak=0;const n=i.length;
  for(let k=0;k<n;k++){sa+=i[k];sb+=t[k];aa+=i[k]**2;bb+=t[k]**2;ab+=i[k]*t[k];peak=Math.max(peak,t[k]);}
  const ncc=(ab-sa*sb/n)/Math.sqrt(Math.max(1e-30,(aa-sa*sa/n)*(bb-sb*sb/n))),fit=ab/(aa+1e-30);
  let mse=0,efficiency=0;
  for(let k=0;k<n;k++){mse+=(fit*i[k]-t[k])**2;if(t[k]>peak*.15)efficiency+=i[k];}
  return {ncc,psnr:-10*Math.log10(Math.max(1e-30,mse/n/(peak**2+1e-30))),efficiency,power:sa};
}
function similarity(i,t){let a=0,b=0,c=0;for(let k=0;k<i.length;k++){a+=i[k]*t[k];b+=i[k]**2;c+=t[k]**2;}return a/Math.sqrt(b*c+1e-30);}
const morse={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.','.' :'.-.-.-',',':'--..--','?':'..--..'};
function encodeMorse(text){
  let upper=text.toUpperCase();if([...upper].some(c=>c!==' '&&!morse[c]))throw Error('摩斯模式支持英文字母、数字、空格及 . , ?；中文请使用 UTF-8 模式。');
  let bits=[],code=[];let words=upper.trim().split(/\s+/).filter(Boolean);
  words.forEach((word,wi)=>{if(wi){bits.push(...Array(7).fill(0));code.push('/');}
    [...word].forEach((c,ci)=>{if(ci)bits.push(0,0,0);code.push(morse[c]);[...morse[c]].forEach((s,si)=>{if(si)bits.push(0);bits.push(...Array(s==='.'?1:3).fill(1));});});});
  return {bits,code:code.join(' '),expected:upper.trim().replace(/\s+/g,' ')};
}
function decodeMorse(bits){
  const reverse=Object.fromEntries(Object.entries(morse).map(([k,v])=>[v,k]));let str='',token='',i=0;
  const flush=()=>{if(token){str+=reverse[token]||'�';token='';}};
  while(i<bits.length){let val=bits[i],j=i;while(j<bits.length&&bits[j]===val)j++;let len=j-i;
    if(val)token+=len<2?'.':'-';else if(len>=3){flush();if(len>=6)str+=' ';}i=j;}
  flush();return str;
}
function communicate(reference,current,text,mode='utf8',snr=24,seed=1,rate=100){
  let bits,code='',expected=text;
  if(mode==='morse'){let e=encodeMorse(text);bits=e.bits;code=e.code;expected=e.expected;}
  else {bits=[];for(let b of new TextEncoder().encode(text))for(let k=7;k>=0;k--)bits.push((b>>k)&1);}
  if(!bits.length)throw Error('请输入要发送的信息。');
  // Balanced spatial matched filter: suppress a uniform detector background.
  // Receiver threshold is calibrated once with the nominal authorized pattern.
  const mean=reference.reduce((s,x)=>s+x,0)/reference.length;
  let den=0,gain=0;for(let k=0;k<reference.length;k++){let w=reference[k]-mean;den+=w*reference[k];gain+=w*current[k];}gain/=den;
  const random=rng(seed),sigma=Math.pow(10,-snr/20),samples=[],received=[];
  bits.forEach(b=>{let x=b*gain+sigma*gaussian(random);samples.push(x);received.push(x>=.5?1:0);});
  let errors=bits.reduce((s,b,i)=>s+(b!==received[i]),0),decoded;
  if(mode==='morse')decoded=decodeMorse(received);
  else {let bytes=[];for(let i=0;i<received.length;i+=8){let b=0;for(let k=0;k<8;k++)b=(b<<1)|received[i+k];bytes.push(b);}decoded=new TextDecoder().decode(new Uint8Array(bytes));}
  return {bits,received,samples,errors,ber:errors/bits.length,decoded,expected,code,gain,sigma,snr,seed,rate,duration:bits.length/rate,correct:decoded===expected};
}
const api={infer,metrics,similarity,communicate,coherentCommunicate,coherentOperator,crc32,fft1,fft2,kernel,propagate,rng,gaussian,jones,encodeMorse,decodeMorse,crop};
root.Optics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
