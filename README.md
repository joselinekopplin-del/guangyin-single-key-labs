# 单变量光学加密仿真

三个独立的单自由度光学加密仿真网页。新建仓库与原版“光隐”分离，原站点没有修改。

- [实验入口](https://joselinekopplin-del.github.io/guangyin-single-key-labs/)
- [入射偏振](https://joselinekopplin-del.github.io/guangyin-single-key-labs/polarization/)
- [第二层旋转角](https://joselinekopplin-del.github.io/guangyin-single-key-labs/rotation/)
- [L₂–L₃ 间距](https://joselinekopplin-del.github.io/guangyin-single-key-labs/spacing/)

## 每页只改变一个维度

| 软件 | 可调参数 | 固定条件 | 已训练通道 |
|---|---|---|---|
| 入射偏振 | 线偏振方向 0–180° | 第二层 0°，L₂–L₃ 6 mm | H → 0，V → 8 |
| 第二层旋转角 | 第二层 0–360° | H 偏振，L₂–L₃ 6 mm | 0°/90°/180°/270° → 0/2/4/6 |
| L₂–L₃ 间距 | 4–12 mm | H 偏振，第二层 0° | 6/10 mm → 0/1 |

三个页面都有实时全息重建、错误参数对照、短文字传输与数字恢复、单参数扫描、CSV/JSON 下载和专业公式。滑块以外的自由度在计算配置中也被固定，而非只在界面隐藏。

## 使用顺序

1. 选择目标通道，建立发射密钥；选择时自动恢复对应正确接收参数。
2. 改变当前参数，比较重建图与目标；“错钥对照”固定为一个不同的标称通道。
3. 输入不超过 122 UTF-8 字节的文字，运行传输。接收机依据当前参数求解，不比较密钥是否相等来伪造输出。
4. 切换错误密钥，再传输一次。观察实际解码文字、误码率与 CRC。
5. 扫描并导出 CSV，或导出当前全息结果及已运行通信与扫描的 JSON。

JSON 包含输入文字和密钥等仿真数据；全部计算在本地浏览器完成，没有应用服务器接收消息。

## 物理与通信模型

复用原 PRISM 的 20260914 训练权重与前向引擎；这是同一三层器件的三个单变量切片，没有宣称重新训练三个独立芯片。每层为 64 × 64 双折射 Jones 相位面，使用 128 × 128 零填充角谱传播，532 nm 波长，8 μm 数值采样（不是纳米单元周期）。L₁–L₂ 和 L₃–相机始终为 4 mm。

旋转第二层时，同步旋转空间复透射率和双折射主轴。非整直角使用双线性复数插值，包含离散化误差与有限孔径裁切。层距页只调整 L₂–L₃，相机随 L₃ 平移。偏振页使用线偏振 Jones 向量；相机记录两正交分量的总强度，没有可调检偏器，H 与 180° 等效。本模型的固定主轴情形满足 I(α)=cos²α I_H+sin²α I_V。

上方为固定训练字符重建。下方文字通信采用 32 × 32 BPSK 空间码元，每帧含长度头与 CRC-32，在有限孔径下通过三层算子。接收端假设可相干测量双偏振复场，以精确伴随算子执行 16 次共轭梯度迭代；普通相机的单幅强度图不提供这些完整测量量。40/30/20/10 dB 模拟复场噪声，固定随机种子使对照可复现。

NCC 是去均值归一化相关系数；PSNR 在拟合亮度后计算；目标区域能量占比为目标超过其峰值 15% 区域的光能相对入射总能量之比。图片独立归一化显示，因此视觉亮度不能直接比较通光效率。扫描曲线为逐点实际传播结果。错误参数可能重建另一个字符或仍泄露消息，不承诺“只要密钥有一点不同就不可读”。CRC 仅检错，不是认证；公开模型和少量离散状态不构成高强度密码。

参考：[Zhang et al., Integrated Polarization, Distance, and Rotation for Multi-DoF Diffractive Processor and Information Encryption, Advanced Materials, 2025](https://doi.org/10.1002/adma.202506222)。论文为太赫兹实验；网页参数是可见光等效模型，不代表样品制造或论文器件的全波复现。

## 字体与设计

网页采用白底、冷灰分区与统一的蓝色交互提示，使用科研仪器界面的清晰信息层级。首页和三个实验页共享同一套布局。正文 18 px，标题加粗。英文字母和数字优先 Times New Roman，中文字形由宋体 SimSun 承接；原生 MathML 使用 Cambria Math。字体来自访问设备，不分发商业字体；缺少指定字体时回退到相应衬线或数学字体。

## 本地运行和验证

需要 Node.js 18+。零运行时依赖。

```sh
npm start
# 打开 http://127.0.0.1:4178/
npm test
# 浏览器测试另需 Playwright：
npm install
npx playwright install chromium
npm run test:browser
```

通过 HTTP(S) 打开，避免 file:// 限制 Web Worker。Windows 已装 Edge 时验收脚本优先使用 Edge；否则使用 Playwright Chromium。可设置 LAB_URL 验收 GitHub Pages。qa/ 截图和测试数据不进入仓库。

`assets/engine.js`、`assets/model-data.js` 是原项目内核的独立副本；`config.js` 将各页的自由度隔离；`worker.js` 后台计算；`app.js` 处理交互；`science.css` 管理共用样式；`build-pages.cjs` 生成入口与三页静态 HTML。GitHub Pages 从 main 分支根目录提供静态文件。

该仓库只包含网页、公开研究参考和模型，不包含项目书、队员简历、文档或登录凭据。
