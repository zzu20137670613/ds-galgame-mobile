import { useState, useEffect } from "react";

/**
 * 移动端软键盘高度检测。
 * 返回键盘高度（px），无键盘时为 0。
 *
 * 策略（按优先级）：
 * 1. VirtualKeyboard API（Chromium Android / Edge）：浏览器原生 API，
 *    overlaysContent=true + geometrychange → 精确键盘高度。
 * 2. visualViewport fallback（iOS / 不支持 VK API 的浏览器）：
 *    追踪最大可视高度做基准，高度缩小即为键盘弹起。
 *
 * 注意：本 hook 只暴露键盘高度，不再操作 DOM（不 shift shell）。
 * 浮动输入面板用这个高度做 bottom 偏移。
 */

interface VKBoundingRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface VirtualKeyboard {
    overlaysContent: boolean;
    boundingRect: VKBoundingRect;
    addEventListener(type: "geometrychange", listener: (e: { target: VirtualKeyboard }) => void): void;
    removeEventListener(type: "geometrychange", listener: (e: { target: VirtualKeyboard }) => void): void;
}

declare global {
    interface Navigator {
        virtualKeyboard?: VirtualKeyboard;
    }
}

export function useMobileKeyboard(): number {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        // ====== 主路径：VirtualKeyboard API ======
        const vk = navigator.virtualKeyboard;
        if (vk) {
            vk.overlaysContent = true;
            const handler = () => setKeyboardHeight(vk.boundingRect.height);
            vk.addEventListener("geometrychange", handler);
            return () => {
                vk.removeEventListener("geometrychange", handler);
                setKeyboardHeight(0);
            };
        }

        // ====== 兜底：visualViewport + window.innerHeight ======
        const vv = window.visualViewport;
        if (!vv) return;

        let maxVvH = 0;
        let maxWinH = 0;

        const detect = () => {
            const vvH = vv.height;
            const vvOffset = vv.offsetTop ?? 0;
            const winH = window.innerHeight;

            // 记录最大值作为无键盘时的基准
            if (vvH > maxVvH) maxVvH = vvH;
            if (winH > maxWinH) maxWinH = winH;

            if (maxWinH === 0) { maxVvH = vvH; maxWinH = winH; return; }

            // 方案A：visualViewport 缩小 + 偏移（非 overlaysContent 模式）
            const khA = Math.max(0, maxVvH - vvH - vvOffset);
            // 方案B：window.innerHeight 缩小（overlaysContent 下 vv 不变，但 window 可能缩小）
            const khB = Math.max(0, maxWinH - winH);
            // 方案C：visualViewport 被键盘上推的偏移量（overlaysContent 纯偏移）
            const khC = vvOffset;

            const kh = Math.max(khA, khB, khC);
            setKeyboardHeight(kh > 100 ? kh : 0);
        };

        vv.addEventListener("resize", detect);
        window.addEventListener("resize", detect);

        const onFocus = () => {
            // 重置基准，以便重新测量键盘高度
            maxVvH = 0;
            maxWinH = 0;
            setTimeout(detect, 100);
            setTimeout(detect, 300);
            setTimeout(detect, 500);
        };
        const onBlur = () => {
            maxVvH = 0;
            maxWinH = 0;
            setTimeout(detect, 150);
        };
        document.addEventListener("focusin", onFocus);
        document.addEventListener("focusout", onBlur);
        detect();

        return () => {
            vv.removeEventListener("resize", detect);
            window.removeEventListener("resize", detect);
            document.removeEventListener("focusin", onFocus);
            document.removeEventListener("focusout", onBlur);
            setKeyboardHeight(0);
        };
    }, []);

    return keyboardHeight;
}