import { useEffect } from "react";

/**
 * 移动端软键盘适配。
 * 键盘弹起时，将 #mobile-shell 上移到 "输入框顶端线" 位置，
 * 确保输入框完整可见、不被键盘遮盖。
 *
 * 规则：
 * - 键盘高度 > 100px 视为弹起
 * - 上移量 = 键盘高度 - 输入框保留高度（80px，含 ChatScreen footer + padding）
 * - 键盘收起时恢复 transform
 */
function getInputReserveHeight(): number {
    // ChatScreen 输入栏大约 64px + 16px padding，取 80px 留余量
    return 80;
}

export function useMobileKeyboard() {
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const shell = document.getElementById("mobile-shell");
        if (!shell) return;

        let wasOpen = false;

        const handleResize = () => {
            const keyboardH = window.innerHeight - vv.height;
            const isOpen = keyboardH > 100;
            const reserveH = getInputReserveHeight();

            if (isOpen) {
                const shift = Math.max(0, keyboardH - reserveH);
                shell.style.transform = `translateY(-${shift}px)`;
            } else {
                shell.style.transform = "translateY(0)";
            }

            // 键盘从开到关 → 强制恢复 transform（防止某些 Android 上残留）
            if (wasOpen && !isOpen) {
                shell.style.transform = "translateY(0)";
            }
            wasOpen = isOpen;
        };

        vv.addEventListener("resize", handleResize);
        return () => vv.removeEventListener("resize", handleResize);
    }, []);
}