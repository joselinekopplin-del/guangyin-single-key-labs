# 光隐 · Material Design 阶段成果页

在线地址：https://joselinekopplin-del.github.io/guangyin-single-key-labs/showcase/

本目录是面向评审的成果页，原532nm网页保留。导航为成果展示、交互演示、器件数据、研究边界。三维查看器直接位于成果展示首页；浏览器内执行传播与接收，不调用FDTD或任何AI接口，不上传输入消息。

## 数据和模型

- `assets/engine.js`、`thz-engine.js`、`thz-evidence.js`由已验收演示快照原样复制，SHA见`data/publication.json`。
- `assets/demo-app.js`是展示适配层；`material.js`只负责导航、回放入口、图片放大和展示摘要，未参与求解/解码。
- `data/cases.json`是明确标注的固定预计算案例；`data/observations/`只含公开复场观测；发送端评价真值独立保存在`data/evaluation_only/`。
- 图表来自已保存的真实单元FDTD或三层近似计算。5×5扫描图不代表更密集求解；系统中间面图不是当前ECNU消息的中间场。
- 原汇报PPT、讲解稿和备用回放文件保留在仓库中；评委页面不再提供展示准备类入口。交互演示中的观测与结果导出仍可用于复核。

归档库27种几何、54条偏振响应；冻结设计C从原25种候选中实际使用24种。0.7THz下周期110μm、柱高/剩余基底各500μm、n=3.42及无损近似仍含文献借用/假设。接收假设获得双偏振振幅和相位。

## 三维结构与字体

首页中的 `#structure` 加载真正由Blender导出的 `models/system.glb`，三层768柱与冻结设计逐项对应。旧 `#structure` 链接仍可直接定位首页查看器，不再切换独立页面。模型在接近视口时加载，离开首页或滚出视口时暂停渲染。支持单层细节、整体视图、三视图、显隐、展开、点选、全屏及触屏；标尺对应当前视图中心平面。显示操作不改仿真参数、观测或密钥。PBR硅外观、工作室环境照明及方向箭头只用于解释结构，不是实物照片或电磁场求解。

可编辑源模型及建模配置位于仓库 `model3d/`。网页模型采用glTF标准米单位，Blender显示毫米；尺寸和来源见 `models/manifest.json`。`detail.png` 为带0.5mm像平面标尺的真实几何渲染，非显微照片。

字体采用本地Roboto与Noto Sans SC派生常用字子集（Guangyin Sans SC），数学公式保留Cambria Math。字体、OFL许可和源文件哈希均在 `assets/fonts/`；未收录中文回退系统无衬线字体。三维所需Three.js r180模块也全部本地保存。

校准案例仍错1/80位，CRC失败；公开模型攻击已有成功恢复消息的记录。局部全波、插值和部分鲁棒性尚未通过；不是原论文定量复现、完整三层全波仿真或实验验证。

## 查看与发布

GitHub Pages从本仓库main分支根目录发布；相对路径均支持`/showcase/`子路径。本机请运行仓库根目录 `启动三维预览.cmd` 通过HTTP查看，避免file协议阻止模型加载。网页不依赖CDN、在线字体服务或远程图片。

Material Design的色彩角色、层次、导航与组件形态参考[官方设计指南](https://m3.material.io/styles/color/roles)，字体搭配依据[Material Web typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md)；GitHub Pages发布规则见[官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。旧532nm网页仍保留原排版，本次字体调整应用于成果展示页。未引入新的构建工具链。

为保留本机隐私，没有上传原始FSP工程、Windows安装路径、许可证、账户资料、开发日志或整套本机展示压缩包。公开来源摘录保留原记录SHA，内部详细验收仍存于项目本机。
