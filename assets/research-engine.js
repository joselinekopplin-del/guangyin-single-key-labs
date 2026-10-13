/* Quantitative co-evaluation of calibration, identifiability and public-model leakage. */
(function(root){
'use strict';
const O=root.Optics||(typeof require==='function'?require('./engine.js'):null),J=root.JointOptics||(typeof require==='function'?require('./joint-engine.js'):null),TA=Float64Array;
function flatten(field){const a=new TA(field[0].r.length*4);let offset=0;for(const p of field){a.set(p.r,offset);offset+=p.r.length;a.set(p.i,offset);offset+=p.i.length;}return a;}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function eigen(matrix){
 const a=matrix.map(r=>r.slice()),v=[[1,0,0],[0,1,0],[0,0,1]];
 for(let t=0;t<30;t++){let p=0,q=1;for(const [i,j]of [[0,1],[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q]))[p,q]=[i,j];if(Math.abs(a[p][q])<1e-13)break;
  const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];
  for(let k=0;k<3;k++)if(k!==p&&k!==q){const akp=a[k][p],akq=a[k][q];a[k][p]=a[p][k]=c*akp-s*akq;a[k][q]=a[q][k]=s*akp+c*akq;}
  a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;a[p][q]=a[q][p]=0;
  for(let k=0;k<3;k++){const kp=v[k][p],kq=v[k][q];v[k][p]=c*kp-s*kq;v[k][q]=s*kp+c*kq;}
 }
 return [0,1,2].map(i=>({value:Math.max(0,a[i][i]),vector:v.map(row=>row[i])})).sort((x,y)=>x.value-y.value);
}
function sensitivity(data,center){
 const random=O.rng(20261013),pilot=TA.from({length:1024},()=>random()>.5?1:-1),base=O.coherentOperator(data,center).forward(pilot),flat=flatten(base),power=dot(flat,flat),units=[1,1,.1],names=['polError','angle','z'],derivatives=[];
 for(let dimension=0;dimension<3;dimension++){
  const h=units[dimension]*.25,plus={...center,[names[dimension]]:center[names[dimension]]+h},minus={...center,[names[dimension]]:center[names[dimension]]-h};
  const hi=O.coherentOperator(data,plus).forward(pilot),lo=O.coherentOperator(data,minus).forward(pilot),d=hi.map((p,j)=>({r:TA.from(p.r,(x,i)=>(x-lo[j].r[i])/.5),i:TA.from(p.i,(x,i)=>(x-lo[j].i[i])/.5)}));
  let re=0,im=0;for(let p=0;p<2;p++)for(let i=0;i<base[p].r.length;i++){re+=base[p].r[i]*d[p].r[i]+base[p].i[i]*d[p].i[i];im+=base[p].r[i]*d[p].i[i]-base[p].i[i]*d[p].r[i];}re/=power;im/=power;
  // Remove the direction explained solely by a common complex gain.
  for(let p=0;p<2;p++)for(let i=0;i<base[p].r.length;i++){d[p].r[i]-=base[p].r[i]*re-base[p].i[i]*im;d[p].i[i]-=base[p].r[i]*im+base[p].i[i]*re;}
  derivatives.push(flatten(d));
 }
 const gram=derivatives.map(a=>derivatives.map(b=>dot(a,b)/power)),correlation=gram.map((row,i)=>row.map((v,j)=>v/Math.sqrt(Math.max(1e-30,gram[i][i]*gram[j][j])))),spectrum=eigen(gram);
 return {center:{...center},units,gram,correlation,strength:gram.map((row,i)=>Math.sqrt(row[i])),eigenvalues:spectrum.map(v=>v.value),weakest:spectrum[0].vector,condition:spectrum[2].value/Math.max(1e-15,spectrum[0].value),method:'Central finite differences; complex-gain projection; normalized real Gram matrix. Local model sensitivity, not key entropy or a Cramer-Rao confidence bound.'};
}
async function publicModelAttack(data,measured,pilot,pilotSymbols,onProgress=()=>{}){
 const ranking=[];for(let i=0;i<data.keys.length;i++){const rx=J.channel(data,i),pred=O.coherentOperator(data,rx).forward(pilotSymbols);ranking.push({index:i,symbol:data.keys[i].symbol,rx,score:J.overlap(pred,pilot).score});onProgress((i+1)/18,{ranking:ranking.slice()});await new Promise(r=>setTimeout(r,0));}
 ranking.sort((a,b)=>b.score-a.score);const best=ranking[0],recovered=await J.solve(data,measured,pilot,pilotSymbols,best.rx,p=>onProgress((16+p*2)/18,{ranking,best}));
 return {ranking,best,decoded:recovered.decoded,crcValid:recovered.crcValid,pilotScore:recovered.pilotScore,scoreGap:best.score-ranking[1].score,assumptions:'Attacker knows the published operator, all 16 nominal tuples, public pilot symbols, and measured complex fields; no sender key or plaintext supplied.'};
}
function wilson(success,n){if(!n)return [0,1];const z=1.96,p=success/n,den=1+z*z/n,mid=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,mid-half),Math.min(1,mid+half)];}
async function repeatedTrials(data,index,config={},onProgress=()=>{}){
 const count=config.count||3,seed=config.seed||20261013,snr=config.snr??30,phaseError=config.phaseError??0,random=O.rng(seed),rows=[];
 if(![3,6,12].includes(count))throw Error('重复次数只支持 3、6 或 12。');
 for(let i=0;i<count;i++){
  const tx={...J.channel(data,index),phaseError},driftScale=config.driftScale??1,drift=[O.gaussian(random)*1.4*driftScale,O.gaussian(random)*.8*driftScale,O.gaussian(random)*.08*driftScale],rx=J.key(tx.polError+drift[0],tx.angle+drift[1],tx.z+drift[2]),frameSeed=Math.floor(random()*4294967296),frame=J.prepareFrame(data,tx,'联合随机试验 '+i,snr,frameSeed);
  const before=await J.decodeFrame(data,frame,rx),cal=await J.calibrate(data,frame.pilot,frame.pilotSymbols,rx),after=await J.decodeFrame(data,frame,cal.estimated);
  rows.push({trial:i+1,seed:frameSeed,drift,beforeBER:before.ber,afterBER:after.ber,beforeSuccess:before.correct,afterSuccess:after.correct,pilotBefore:cal.initialScore,pilotAfter:cal.score,candidates:cal.count});onProgress((i+1)/count,rows.slice());await new Promise(r=>setTimeout(r,0));
 }
 const beforeCount=rows.filter(r=>r.beforeSuccess).length,afterCount=rows.filter(r=>r.afterSuccess).length,mean=field=>rows.reduce((s,r)=>s+r[field],0)/count;
 return {count,seed,index,snr,phaseError,driftScale:config.driftScale??1,rows,before:{success:beforeCount,rate:beforeCount/count,ci:wilson(beforeCount,count),meanBER:mean('beforeBER')},after:{success:afterCount,rate:afterCount/count,ci:wilson(afterCount,count),meanBER:mean('afterBER')},note:'Paired same-frame trials; Gaussian synchronization drift SD 1.4 deg, 0.8 deg, 0.08 mm multiplied by the selected scale; Wilson 95% interval for message recovery, conditional on this simulation setup.'};
}
const api={sensitivity,publicModelAttack,repeatedTrials,wilson,eigen};root.ResearchOptics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
