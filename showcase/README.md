# 光隐 · Material Design 阶段成果页

在线地址：https://joselinekopplin-del.github.io/guangyin-single-key-labs/showcase/

本目录是独立成果页，原532nm网页保留。页面包含成果概览、交互演示、器件数据和研究边界；浏览器内执行传播与接收，不调用FDTD或任何AI接口，不上传输入消息。

## 数据和模型

- `assets/engine.js`、`thz-engine.js`、`thz-evidence.js`由已验收演示快照原样复制，SHA见`data/publication.json`。
- `assets/demo-app.js`是展示适配层；`material.js`只负责导航、回放入口、图片放大和展示摘要，未参与求解/解码。
- `data/cases.json`是明确标注的固定预计算案例；`data/observations/`只含公开复场观测；发送端评价真值独立保存在`data/evaluation_only/`。
- 图表来自已保存的真实单元FDTD或三层近似计算。5×5扫描图不代表更密集求解；系统中间面图不是当前ECNU消息的中间场。
- `downloads/`提供8页汇报PPT和5分钟讲解稿；`静态回放.html`是可下载后单独打开的备用文件。

归档库27种几何、54条偏振响应；当前设计仍使用原25种几何。0.7THz下周期110μm、柱高/剩余基底各500μm、n=3.42及无损近似仍含文献借用/假设。接收假设获得双偏振振幅和相位。

校准案例仍错1/80位，CRC失败；公开模型攻击已有成功恢复消息的记录。局部全波、插值和部分鲁棒性尚未通过；不是原论文定量复现、完整三层全波仿真或实验验证。

## 查看与发布

GitHub Pages从本仓库main分支根目录发布；相对路径均支持`/showcase/`子路径。直接用较新的Edge或Chrome打开本目录index.html也可本地计算。网页不依赖CDN、外部字体或远程图片。

Material Design的色彩角色、层次、导航与组件形态参考[官方设计指南](https://m3.material.io/styles/color/roles)；GitHub Pages发布规则见[官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。中文正文沿用宋体，英数Times New Roman，数学符号使用Cambria Math。未引入新的构建工具链。

为保留本机隐私，没有上传原始FSP工程、Windows安装路径、许可证、账户资料、开发日志或整套本机展示压缩包。公开来源摘录保留原记录SHA，内部详细验收仍存于项目本机。
