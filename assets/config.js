(function(root){
  'use strict';
  const labs = {
    polarization: {
      number:'壹', en:'POLARIZATION', title:'以偏振为钥', short:'入射偏振', symbol:'α', unit:'°', min:0,max:180,step:1, scanStep:5,
      keys:[0,8], presets:[0,45,90,135], fixed:'第二层 0° · L₂–L₃ 6 mm',
      intro:'转动入射线偏振方向，观察同一器件中的不同全息通道。',
      control:'入射线偏振方向', help:'0° 为水平 H，90° 为垂直 V；180° 与 0° 在本强度模型中等效。',
      mechanism:'双折射相位面对两个偏振分量施加不同相位。改变入射方向，会改变这两个通道的权重；相机记录两分量的总强度。这里固定检偏条件，不把检偏角加入密钥。',
      lesson:'偏振由水平转向垂直时，重建图会从字符 0 逐渐过渡到字符 8。中间角度可能同时显现两个字符，不能预设为“完全不可读”。',
      formula:'<mrow><mi mathvariant="bold">E</mi><mo>(</mo><mi>α</mi><mo>)</mo></mrow><mo>=</mo><mfenced open="[" close="]"><mtable><mtr><mtd><mi>cos</mi><mo>⁡</mo><mi>α</mi></mtd></mtr><mtr><mtd><mi>sin</mi><mo>⁡</mo><mi>α</mi></mtd></mtr></mtable></mfenced><mo>,</mo><mspace width="1em"/><mi>I</mi><mo>=</mo><msup><mi>cos</mi><mn>2</mn></msup><mo>⁡</mo><mi>α</mi><msub><mi>I</mi><mi>H</mi></msub><mo>+</mo><msup><mi>sin</mi><mn>2</mn></msup><mo>⁡</mo><mi>α</mi><msub><mi>I</mi><mi>V</mi></msub>'
    },
    rotation: {
      number:'贰',en:'ROTATION',title:'以转角为钥',short:'第二层旋转角',symbol:'θ₂',unit:'°',min:0,max:360,step:1,scanStep:10,
      keys:[0,2,4,6],presets:[0,90,180,270],fixed:'入射 H 偏振 · L₂–L₃ 6 mm',
      intro:'只转动第二层相位面，让空间结构与偏振主轴一同变化。',
      control:'第二层旋转角',help:'第一层与第三层固定。0° 与 360° 等效；非整直角采用复透射率插值。',
      mechanism:'第二层的空间相位图与双折射主轴一起旋转，改变之后的干涉结果。旋转第一层、旋转相机或仅旋转最终图像都不等价于这个实验。',
      lesson:'0°、90°、180°、270° 分别对应训练字符 0、2、4、6。其他角度由传播模型实时计算，不使用预制的模糊效果。',
      formula:'<mrow><msub><mi>J</mi><mn>2</mn></msub><mo>(</mo><mi>θ</mi><mo>;</mo><mi mathvariant="bold">r</mi><mo>)</mo></mrow><mo>=</mo><mrow><mi>R</mi><mo>(</mo><mi>θ</mi><mo>)</mo></mrow><mrow><msub><mi>J</mi><mn>2,0</mn></msub><mo>[</mo><mrow><mi>R</mi><mo>(</mo><mo>−</mo><mi>θ</mi><mo>)</mo></mrow><mi mathvariant="bold">r</mi><mo>]</mo></mrow><mrow><mi>R</mi><mo>(</mo><mo>−</mo><mi>θ</mi><mo>)</mo></mrow>'
    },
    spacing: {
      number:'叁',en:'LAYER SPACING',title:'以层距为钥',short:'L₂–L₃ 间距',symbol:'d₂₃',unit:'mm',min:4,max:12,step:.1,scanStep:.25,
      keys:[0,1],presets:[6,8,10,12],fixed:'入射 H 偏振 · 第二层 0°',
      intro:'改变第二层与第三层之间的传播距离，寻找信息重现的位置。',
      control:'L₂–L₃ 间距',help:'只调整中间这一段。L₁–L₂ 为 4 mm，L₃–相机为 4 mm，始终固定。',
      mechanism:'光在 L₂ 与 L₃ 之间传播时不断积累空间频率相关的相位。改变这一段距离，会改变到达第三层的光场，从而改变最终重建图。',
      lesson:'6 mm 与 10 mm 分别对应训练字符 0 与 1。移动 L₃ 时，相机要随 L₃ 一起移动，维持末段 4 mm，才是本页面的单变量实验。',
      formula:'<msub><mi>U</mi><mn>3</mn></msub><mo>=</mo><msup><mi mathvariant="script">F</mi><mrow><mo>−</mo><mn>1</mn></mrow></msup><mfenced><mrow><mrow><mi mathvariant="script">F</mi><mo>[</mo><msub><mi>U</mi><mn>2</mn></msub><mo>]</mo></mrow><msup><mi>e</mi><mrow><mi>i</mi><mfrac><mrow><mn>2</mn><mi>π</mi><msub><mi>d</mi><mn>23</mn></msub></mrow><mi>λ</mi></mfrac><msqrt><mrow><mn>1</mn><mo>−</mo><msup><mi>λ</mi><mn>2</mn></msup><mo>(</mo><msubsup><mi>f</mi><mi>x</mi><mn>2</mn></msubsup><mo>+</mo><msubsup><mi>f</mi><mi>y</mi><mn>2</mn></msubsup><mo>)</mo></mrow></msqrt></mrow></msup></mrow></mfenced>'
    }
  };
  function options(mode,value){
    if(!labs[mode])throw Error('未知实验模式');
    if(!Number.isFinite(value)||value<labs[mode].min||value>labs[mode].max)throw Error('参数超出本实验范围');
    return {pol:'H',polError:mode==='polarization'?value:0,angle:mode==='rotation'?value:0,z:mode==='spacing'?value:6,wavelength:532,phaseError:0,seed:20260920};
  }
  function keyValue(mode,k){return mode==='polarization'?k.pol*90:mode==='rotation'?k.angle:k.z*1000;}
  function wrongValue(mode,value){return mode==='polarization'?(value+90)%180:mode==='rotation'?(value+90)%360:value===6?10:6;}
  const api={labs,options,keyValue,wrongValue};root.LabConfig=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
