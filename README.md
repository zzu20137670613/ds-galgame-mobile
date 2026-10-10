# 深海回响 · 移动版

以 DeepSeek 鲸鱼娘为主角的 Galgame，**手机横屏 PWA 专用版**。

> 桌面版（Electron + exe 安装包）见 [ds_galgamePC](https://github.com/zzu20137670613/ds_galgamePC)

## 快速开始

```bash
git clone https://github.com/zzu20137670613/ds-galgame-mobile.git
cd ds-galgame-mobile
npm install
npm run dev
```

浏览器打开 Vite 给出的局域网地址（如 `http://192.168.x.x:5173`），手机连同一 WiFi 扫码即可。

> 首次运行需填入你自己的 DeepSeek API Key。

## 构建部署

```bash
npm run build     # 产物在 dist/
```

把 `dist/` 部署到任意静态托管（Vercel / Netlify / GitHub Pages / 自建 Nginx）即可。PWA 已配置完毕，用户访问后可"添加到主屏幕"，获得接近原生 App 的全屏横屏体验。

## 与桌面版的区别

| | 桌面版 (ds_galgamePC) | 移动版 (ds-galgame-mobile) |
|---|---|---|
| 形态 | Electron 桌面应用 + NSIS 安装包 | PWA（移动浏览器 / 添加到主屏幕） |
| 存档 | IndexedDB + 本地文件双轨 | IndexedDB |
| API 转发 | Electron 主进程代理 | 浏览器直接 fetch |
| 布局 | 固定 1280×800 窗口 | 16:10 弹性适配横屏（两端自动补黑条） |
| 触控 | 鼠标为主 | 按钮/图标放大 ~1.4x |
| 键盘 | 物理键盘 | 软键盘弹起时画布自动上移 |
| 图片裁剪 | 居中 | 优先裁下方（底:顶 = 3:1） |
| 横屏锁定 | 无 | PWA manifest + Screen Orientation API |

代码层面，两个仓库共享同一套 React + PixiVN 骨架。移动版去掉了 Electron 主进程，所有能力通过 `isElectronDesktop()` 自动降级到 IndexedDB / fetch 兜底——**表里的差异是平台能力差异，不是逻辑分叉**。

## 想把主角换成你家 AI？

立绘、背景、贴纸怎么换，都在 [HANDOFF.md](./HANDOFF.md) 里；仓库还附了一个配套 Skill（`.trae/skills/gal-brand-replace/SKILL.md`）。移动版和桌面版共用同一套素材体系，换一次两边生效。