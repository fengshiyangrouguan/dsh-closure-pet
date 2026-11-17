# NOTICE

本插件的**代码**整体可按 MIT 使用，但随包的资源带有各自的来源与限制，分发前请逐项确认。

## 游戏素材（不得二次分发）

- `assets/spine/ac_s_closur_spine.{json,atlas,png}` —— 《明日方舟》可露希尔自走棋皮肤（Spine 3.8），版权归上海鹰角网络所有
- `assets/audio/*.ogg` —— 由游戏内 `autochess_b_ui_*` 音效转码而来，版权归上海鹰角网络所有

这些资源仅限**个人本机自用**。若要公开分发本插件，必须：
1. 从仓库与打包产物中移除上述文件；
2. 改为由使用者从自己的游戏安装中提取后本地生成；
3. 在 README 中说明清楚。

## Spine 运行时

- `assets/vendor/spine-webgl.js`、`assets/vendor/spine-canvas.js` —— Esoteric Software Spine Runtimes 3.8，采用 Spine Runtimes License（商业使用需授权，个人/内部使用遵循其许可条款）。详见 <https://esotericsoftware.com/spine-runtimes-license>。

## 字体

- `assets/fonts/ark-pixel-12px-zh_hans.woff2` —— Ark Pixel Font，作者 TakWolf，SIL Open Font License 1.1，许可证随包放在 `assets/fonts/OFL.txt`。

## 设置与数据文件

运行后会在 `$DSH_HOME/.dshcl.json` 写入设置与当日花费统计（`settings` / `spend`）。
卸载插件时可手动删除该文件；不删也不会影响 DSH 其他功能。
