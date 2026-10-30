# Trikey · Material Design 阶段成果页

在线地址：https://joselinekopplin-del.github.io/guangyin-single-key-labs/showcase/

本目录是面向评审的成果页，原532nm网页保留。导航为成果展示、交互演示、公开导频、器件数据、研究边界。三维查看器直接位于成果展示首页；浏览器内执行传播与接收，不调用FDTD或任何AI接口，不上传输入消息。

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


## 公开导频独立研究

成果首页新增公开导频研究入口，结果页位于`research/public-pilots/`。这是已保存计算的统计展示，原交互模型和校准实现保留。固定模型下评估专用训练、隐含长度头、连续搜索、线性解码与按需协议；完整观测和私有标签只在本机研究目录。统计CSV、摘要及协议摘录随站点提供；未将PPT/讲解稿准备入口加回评委页面。研究完成不等于系统保密性、全器件FDTD或实测已通过。

## 公开导频交互可视化

主站`#pilots`提供归档结果的交互查看，主导航和成果首页均可进入；不是新站点，也不调用FDTD或传播器。15个偏差/噪声条件可切换，只有已计算K显示数据；缺失组合显示未计算，K0无训练的线性方法显示不适用。完整包正确率与32位负载BER分开，双侧95%区间与99%单侧确认分开。

独立确认页比较A/B/C全体299会话，不把按需停止K子组当作随机固定预算。补充页比较累计公开信息、固定总能量、提高搜索预算；后两者按同10会话配对。图表为本地原生SVG，支持键盘点选、数据与SVG导出、触屏布局；无新增CDN/字体/库。

数据为`research/public-pilots/visual-data.json`，包含1411条件行、24策略汇总和30配对统计；字段白名单来自冻结研究summary及per_receiver，保存来源SHA与派生方法。没有上传消息真值、随机种子、逐会话观测或本机路径。界面适配为`assets/pilot-visual.js`/`.css`。模型、原收发程序及3D资产不变。
