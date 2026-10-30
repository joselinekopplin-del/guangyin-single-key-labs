# 本地 Material 风格字体

网页的英文和数字使用 Roboto，中文使用源自 Noto Sans SC 的常用字子集。本子集已更名为 **Guangyin Sans SC**，避免以原保留名称发布修改字体；字体风格仍来自原始 Noto Sans SC 字形。Google Material 官方文档采用 Roboto，并为 Roboto 不覆盖的文字推荐 Noto。

- 英文、数字、希腊字母：Roboto 400–700 可变字重，四个官方 WOFF2 字库，未修改字节。
- 中文：Noto Sans SC 常用字子集，400–700 可变字重，覆盖 GB2312、当前页面/脚本文本和中日韩标点，共 7,493 个 Unicode 映射。
- 少见或未收录输入：回退到系统 Noto Sans SC、微软雅黑、苹方或系统无衬线，不限制消息输入或改变编码器。
- 数学排版：保持 Cambria Math 的优先选择；不是用正文字体替代数学排版。
- 五个 WOFF2 文件合计 1,962,336 字节，全部随站点提供。网页运行不连接 Google Fonts、不依赖在线 CDN。

`material-fonts.css` 必须位于原页面样式和查看器样式之后加载。它引用本目录的 `font-faces.css`；该文件内部的字体地址相对于本目录。桌面正文17px、中文行高1.65，标题500字重，按钮和标签500字重；数字指标使用等宽数字特性。移动页面正文16px。

原始许可证完整保存在 `roboto-OFL.txt`、`notosanssc-OFL.txt`。下载来源、源文件与最终文件SHA-256、字体版本URL、Git blob和子集策略见 `provenance.json`。这些字体不是Google Sans的复制，也不宣称本网站得到Google认证。

官方依据：

- [Material Web typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md)
- [Google Material Roboto/Noto typography](https://m1.material.io/style/typography.html)
- [Google Fonts Roboto](https://github.com/google/fonts/tree/main/ofl/roboto)
- [Google Fonts Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)

`build_fonts.py` 是可选字体构建脚本，不参与网页运行。它使用已有 fontTools 和 Node 内置 Brotli，无需修改系统字体或全局设置。传入已有Node路径；必要时用 `--fonttools-path` 指向已有fontTools所在的site-packages目录。重建过程需要联网下载官方字体源；网站展示不需要联网。生成后重新执行浏览器验收，不直接覆盖已记录的验收哈希。
