const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),O=require('../assets/engine.js'),J=require('../assets/joint-engine.js');
const s={window:{}};vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../assets/model-data.js'),'utf8'),s);const D=s.window.MODEL_DATA;
(async()=>{
 assert.equal(D.keys.length,16);
 const channels=D.keys.map((k,i)=>({symbol:k.symbol,ncc:O.metrics(O.infer(D,J.channel(D,i)).intensity,D.targets[i]).ncc}));assert(channels.every(k=>k.ncc>.97));
 const tx=J.channel(D,11),frame=J.prepareFrame(D,tx,'联合密钥 ECNU',30,98765),snapshot=frame.measured[0].r.slice();
 const good=await J.decodeFrame(D,frame,tx);assert(good.crcValid);assert.equal(good.ber,0);assert.equal(good.decoded,'联合密钥 ECNU');
 const wrong=await J.decodeFrame(D,frame,J.altered(tx,7));assert(wrong.ber>.1);
 const drift=J.key(tx.polError+1.5,tx.angle+1,tx.z+.1),before=await J.decodeFrame(D,frame,drift);
 const cal=await J.calibrate(D,frame.pilot,frame.pilotSymbols,drift),after=await J.decodeFrame(D,frame,cal.estimated);
 assert(cal.score>cal.initialScore);assert(after.ber<=before.ber);assert(after.crcValid);
 assert.deepEqual(Array.from(frame.measured[0].r),Array.from(snapshot),'Decoding must preserve the fixed ciphertext');
 const map=await J.tolerance(D,11,tx);assert.equal(map.points.length,81);assert(map.points[40].ncc>.97);
 console.log(JSON.stringify({passed:true,channels,good:{crc:good.crcValid,ber:good.ber},wrong:{crc:wrong.crcValid,ber:wrong.ber},calibration:{beforeBER:before.ber,afterBER:after.ber,initialScore:cal.initialScore,score:cal.score,estimated:cal.estimated,trials:cal.count},map:{points:map.points.length,qualifying:map.qualifying}},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
