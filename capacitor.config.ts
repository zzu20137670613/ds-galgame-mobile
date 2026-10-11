import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.deepseek.galgame.mobile",
    appName: "深海回响",
    webDir: "dist",
    server: {
        // 生产环境加载本地静态资源，无需远程服务器
        androidScheme: "https",
    },
};

export default config;