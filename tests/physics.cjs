const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const C=require('../assets/config.js'),O=require('../assets/engine.js'),sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/model-data.js'),'utf8'),sandbox);
const D=sandbox.window.MODEL_DATA;
const relative=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/b.reduce((s,v)=>s+v*v,0));
const results=[];
for(const [mode,c] of Object.entries(C.labs)){
  for(const index of c.keys){const key=D.keys[index],v=C.keyValue(mode,key),p=C.options(mode,v),r=O.infer(D,p),m=O.metrics(r.intensity,D.targets[index]);assert(m.ncc>.97);assert(r.power>0&&r.power<=1.000001);results.push({mode,index,ncc:m.ncc});}
  for(const v of [c.min,(c.min+c.max)/2,c.max]){const p=C.options(mode,v);if(mode!=='polarization')assert.equal(p.polError,0);if(mode!=='rotation')assert.equal(p.angle,0);if(mode!=='spacing')assert.equal(p.z,6);assert.equal(p.pol,'H');}
}
const h=O.infer(D,C.options('polarization',0)).intensity,v=O.infer(D,C.options('polarization',90)).intensity,d=O.infer(D,C.options('polarization',45)).intensity;
assert(relative(d,h.map((x,i)=>(x+v[i])/2))<1e-10,'45-degree intensity must equal incoherent orthogonal-channel sum');
assert(relative(h,O.infer(D,C.options('polarization',180)).intensity)<1e-10,'H and 180-degree polarization are equivalent');
assert(relative(h,O.infer(D,C.options('rotation',360)).intensity)<1e-10,'full rotation is periodic');
assert(relative(h,O.infer(D,C.options('spacing',10)).intensity)>.1,'changing d23 must change diffraction output');
assert.throws(()=>C.options('spacing',100));assert.throws(()=>C.options('rotation',NaN));
const original=path.join(__dirname,'../../prism-holographic-lab');
if(fs.existsSync(original)){const hashes=require('./original-hashes.json');for(const [file,hash] of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(original,file))).digest('hex'),hash,'Original site changed: '+file);}
console.log(JSON.stringify({passed:true,checks:['nominal holograms','locked dimensions','polarization superposition','periodicity','spacing sensitivity','input bounds','original site preserved'],channels:results},null,2));
