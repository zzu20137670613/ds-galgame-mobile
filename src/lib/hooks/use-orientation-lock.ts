import { useEffect, useCallback } from "react";

/**
 * 横屏方向锁定。
 * 浏览器安全策略要求 lock() 必须在用户手势后调用 —— 首次加载先监听交互事件，
 * 用户一点屏幕：① 隐藏竖屏提示层 ② 调用 lock()。
 * 之后 orientation change 也会自动重试。
 * PWA 模式下 manifest 已声明 "orientation": "landscape"，此处为浏览器兜底。
 */
export function useOrientationLock() {
    const lock = useCallback(async () => {
        if (!("orientation" in screen && "lock" in screen.orientation)) return;
        try {
            await (screen.orientation as any).lock("landscape-primary");
        } catch {
            // 静默失败（不支持的设备 / 无用户手势）
        }
    }, []);

    useEffect(() => {
        let unlocked = false;

        const hideOverlay = () => {
            const overlay = document.getElementById("portrait-overlay");
            if (overlay) overlay.classList.add("hidden");
        };

        const showOverlayMaybe = () => {
            // 切回横屏后重置 hidden 状态，让 CSS @media 重新接管
            const overlay = document.getElementById("portrait-overlay");
            if (overlay) overlay.classList.remove("hidden");
        };

        // 用户交互时：隐藏提示层 + 尝试锁屏
        const handleInteraction = () => {
            hideOverlay();
            lock();
        };

        // 方向变化时：重置提示层可见性 + 重试锁屏
        const handleChange = () => {
            showOverlayMaybe();
            lock();
        };

        document.addEventListener("click", handleInteraction);
        document.addEventListener("touchend", handleInteraction);
        screen.orientation?.addEventListener("change", handleChange);

        return () => {
            document.removeEventListener("click", handleInteraction);
            document.removeEventListener("touchend", handleInteraction);
            screen.orientation?.removeEventListener("change", handleChange);
            if (!unlocked) {
                try {
                    (screen.orientation as any).unlock();
                    unlocked = true;
                } catch { /* ignore */ }
            }
        };
    }, [lock]);
}