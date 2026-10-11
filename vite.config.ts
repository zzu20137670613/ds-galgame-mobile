import { AssetPack } from "@assetpack/core";
import type { AssetsManifest } from "@drincs/pixi-vn/pixi.js";
import { vitePluginPixivn } from "@drincs/pixi-vn/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
// lightningcss 随 Tailwind v4 一起安装（@tailwindcss/node 的依赖），此处直接复用
import { transform as transformCss } from "lightningcss";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { VitePWA } from "vite-plugin-pwa";
import assetPackConfig from "./.assetpack.ts";

/** 兼容目标：雷电模拟器自带的 Android WebView 91（Chromium 91） */
const LEGACY_BROWSER_TARGETS = { chrome: 91 << 16 };

/**
 * List of external hostnames whose responses should be cached by the service worker.
 * Add any CDN or remote asset host here to enable offline caching for it.
 * Examples:
 *   "cdn.jsdelivr.net"
 *   "your.cdn.domain.com"
 */
const CACHED_EXTERNAL_HOSTNAMES: string[] = ["raw.githubusercontent.com"];

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    // PWA 需要绝对路径 base，确保 SW 能正确注册和缓存所有资源
    // Electron 用 file:// 加载时才需要相对路径 "./"
    base: "/",
    plugins: [
        assetpackPlugin(),
        legacyCssCompatPlugin(),
        checker({
            typescript: {
                tsconfigPath: "tsconfig.app.json",
            },
        }),
        mode !== "production" && devtools(),
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        react(),
        tailwindcss(),
        vitePluginPixivn({
            content: "./src/content/index.ts",
            characters: "./src/content/characters.ts",
            labels: "./src/content/labels/*.label.ts",
            typeFilePath: "./src/pixi-vn.keys.gen.ts",
            assetsManifest: async (ssrLoadModule) => {
                const mod = (await ssrLoadModule("/src/assets/index.ts")) as {
                    manifest: AssetsManifest;
                };
                if (!mod.manifest)
                    throw new Error("Assets manifest not found in /src/assets/index.ts");
                return mod.manifest;
            },
        }),
        VitePWA({
            // generate icons with: npm run icon
            includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png"],
            manifest: {
                name: "深海回响",
                short_name: "深海回响",
                description: "DeepSeek Whale Galgame",
                theme_color: "#ffffff",
                start_url: "/",
                display: "fullscreen",
                orientation: "landscape",
                icons: [
                    {
                        src: "pwa-192x192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "pwa-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "maskable-icon-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => CACHED_EXTERNAL_HOSTNAMES.includes(url.hostname),
                        handler: "CacheFirst",
                        options: {
                            cacheName: "external-assets-v1",
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                            expiration: {
                                maxAgeSeconds: 7 * 24 * 60 * 60,
                            },
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        tsconfigPaths: true,
        preserveSymlinks: true,
    },
    server: {
        proxy: {
            // 浏览器直连大模型 API 会被 CORS 拦，统一走本地代理转发；
            // Electron/桌面端阶段可去掉 proxy、由主进程直接请求。
            "/dg-api": {
                target: "https://api.deepseek.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/dg-api/, ""),
            },
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        __APP_NAME__: JSON.stringify(process.env.npm_package_name),
    },
    build: {
        // 不做转译，依赖现代 WebView 原生支持；开 sourcemap 方便调试
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (
                        id.includes("react-markdown") ||
                        id.includes("rehype-raw") ||
                        id.includes("remark-gfm")
                    )
                        return "markdown";
                    if (id.includes("tone")) return "tone";
                    if (id.includes("@drincs/pixi-vn-spine")) return "spine";
                    if (id.includes("pixi.js")) return "pixi.js";
                    if (id.includes("motion")) return "motion";
                    if (id.includes("@drincs/pixi-vn")) return "pixi-vn";
                },
            },
        },
    },
}));

/**
 * 构建期把产物 CSS 按旧浏览器目标重新降级（仅在 build 阶段生效，不影响 dev）。
 *
 * 背景：Tailwind v4 默认只面向现代浏览器，输出的 CSS 里有旧内核对不上的新语法，
 * 而旧内核（如雷电模拟器自带 WebView 91 / Chromium 91）遇到不认识的语法会整条丢弃：
 *   ① @media (width>=40rem) 范围语法 → 整个 sm:/md:/lg: 响应式块失效
 *      （表现为弹窗宽度不再被 sm:max-w-sm 收窄 → 溢出屏幕）
 *   ② oklch() 颜色（Chromium 111+）→ 颜色值无效
 * 用 Lightning CSS 按目标版本降级：① 转成 min-width 写法 ② 补 rgb 回退。
 * 注意：translate / scale 独立变换属性 Lightning CSS 不会降级，由 src/styles.css 手动兜底。
 */
function legacyCssCompatPlugin(): Plugin {
    return {
        name: "vite-plugin-legacy-css-compat",
        apply: "build",
        enforce: "post",
        generateBundle(_options, bundle) {
            for (const file of Object.values(bundle)) {
                if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
                const result = transformCss({
                    filename: file.fileName,
                    code:
                        typeof file.source === "string"
                            ? Buffer.from(file.source)
                            : file.source,
                    minify: true,
                    targets: LEGACY_BROWSER_TARGETS,
                });
                file.source = result.code;
            }
        },
    };
}

function assetpackPlugin(): Plugin {
    let mode: ResolvedConfig["command"];
    let ap: AssetPack | undefined;

    return {
        name: "vite-plugin-assetpack",
        configResolved(resolvedConfig) {
            mode = resolvedConfig.command;
            if (!resolvedConfig.publicDir) return;
            if (assetPackConfig.output) return;
            const publicDir = resolvedConfig.publicDir.replace(process.cwd(), "");
            assetPackConfig.output = `.${publicDir}/assets/`;
        },
        buildStart: async () => {
            if (mode === "serve") {
                if (ap) return;
                ap = new AssetPack(assetPackConfig);
                void ap.watch();
            } else {
                await new AssetPack(assetPackConfig).run();
            }
        },
        buildEnd: async () => {
            if (ap) {
                await ap.stop();
                ap = undefined;
            }
        },
    };
}
