import { useEffect } from "react";

/**
 * 横屏方向锁定。
 * PWA manifest 已声明 "orientation": "landscape"，此 hook 为浏览器模式下兜底。
 */
export function useOrientationLock() {
    useEffect(() => {
        let currentOrientation: string | null = null;

        const lock = async () => {
            // Screen Orientation API（Chrome/Edge/Safari 均支持）
            if ("orientation" in screen && "lock" in screen.orientation) {
                try {
                    await (screen.orientation as any).lock("landscape-primary");
                    currentOrientation = "landscape-primary";
                } catch {
                    // lock 失败不阻塞（用户手势要求未满足时静默跳过）
                }
            }
        };

        const handleChange = () => {
            lock();
        };

        lock();
        screen.orientation?.addEventListener("change", handleChange);
        return () => {
            screen.orientation?.removeEventListener("change", handleChange);
            if (currentOrientation) {
                // 页面卸载时解锁（避免影响其他页面）
                try {
                    (screen.orientation as any).unlock();
                } catch { /* ignore */ }
            }
        };
    }, []);
}