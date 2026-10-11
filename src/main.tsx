import App from "@/App";
import {
    BGM_CHANNEL_NAME,
    CANVAS_UI_LAYER_NAME,
    HTML_CANVAS_LAYER_NAME,
    HTML_UI_LAYER_NAME,
    SFX_CHANNEL_NAME,
} from "@/constants";
import { ChannelSound } from "@/lib/stores/channel-sound-stores";
import { MasterSound } from "@/lib/stores/master-sound-storage";
import { SetupStore } from "@/lib/stores/setup-store";
import { SkipSettings } from "@/lib/stores/skip-settings-store";
import "@/styles.css";
import { Assets, canvas, CanvasManagerStatic, Container, drawCanvasErrorHandler, Game, sound, NarrationManagerStatic } from "@drincs/pixi-vn";
import type { LabelIdType } from "@drincs/pixi-vn/narration";
import { createRoot } from "react-dom/client";
import { clearCurrentBackground } from "@/lib/utils/assets-utility";
import { bundleIds } from "@/pixi-vn.keys.gen";
import {
    clearActiveHiddenSeq,
    HIDDEN_LABELS,
    setActiveHiddenLabel,
    setActiveHiddenSeqFromLabel,
    takeActiveHiddenLabel,
    takePendingAutoLink,
} from "@/lib/archive/hidden-progress";

// Canvas setup with PIXI
const body = document.body;
if (!body) {
    throw new Error("body element not found");
}

// 移动端 Shell：16:10 固定比例容器，居中，超长屏两端自动黑条
const shell = document.createElement("div");
shell.id = "mobile-shell";
const root = document.getElementById("root");
if (root) {
    shell.appendChild(root);
}
body.appendChild(shell);

// JS 设置 shell 真实尺寸（100dvh 在部分手机浏览器上计算不准，用 window.innerWidth/Height 替代）
// 注意：
// 1. 判断横竖屏用 screen.orientation.type（不随键盘变化，比 screen.width/height 更可靠）
// 2. 键盘弹出时部分浏览器会互换 innerWidth/innerHeight（内部切竖屏），
//    所以宽取 max、高取 min，保证壳子始终横屏比例
// 3. 缓存最大宽高，防止键盘弹出导致壳子缩水
// 4. 竖屏时只清 CSS 不重置缓存，切回横屏时缓存还在
let maxShellW = 0;
let maxShellH = 0;

function updateShellSize() {
    const orientationType = screen.orientation?.type ?? "";
    const isLandscape = orientationType.startsWith("landscape")
        || (screen.width > screen.height); // fallback
    console.log("[SHELL] updateShellSize: innerW×innerH=" + window.innerWidth + "×" + window.innerHeight,
        "screenW×screenH=" + screen.width + "×" + screen.height,
        "orientation=" + orientationType,
        "isLandscape=" + isLandscape,
        "maxShellW=" + maxShellW + " maxShellH=" + maxShellH,
        "current top=" + shell.style.top);
    if (isLandscape) {
        // 键盘弹出时 innerWidth/Height 可能互换，强制宽取大值、高取小值
        const w = Math.max(window.innerWidth, window.innerHeight);
        const h = Math.min(window.innerWidth, window.innerHeight);
        if (w > maxShellW) maxShellW = w;
        if (h > maxShellH) maxShellH = h;
        shell.style.width = (maxShellW || w) + "px";
        shell.style.height = (maxShellH || h) + "px";
    } else {
        // 竖屏只清 CSS 尺寸，交给 CSS media query 控制；不重置缓存
        shell.style.width = "";
        shell.style.height = "";
    }
}
updateShellSize();
window.addEventListener("resize", updateShellSize);

// 占位 navigate：PixiVN 引擎初始化时需要 navigate 函数已注册，
// 真正有效的 navigate 会在 RootProvider 渲染后覆盖此占位。
Game.onNavigate(() => {});

// pixi-vn 的 resizeMode "contain" 内部 resize() 方法（静态 CanvasManagerStatic.resize）
// 会用 document.documentElement 的 clientWidth/clientHeight 做容器尺寸计算，
// 而非传入的 shell 元素。在部分手机浏览器上 document 高度不准，导致 contain 缩放/居中全错。
// 解法：在 Game.init 之前替换 CanvasManagerStatic.resize，直接用 shell 的真实尺寸
//（由 JS 根据 window.innerWidth/Height 设置）重做 contain 计算和 canvas/HTML-layer CSS 定位。
(CanvasManagerStatic as any).resize = function () {
    // clientWidth/Height 在部分手机自带浏览器初始化时可能为 0（布局尚未完成），
    // fallback 到 shell 的 inline style 值或 window.innerWidth/Height
    let containerW = shell.clientWidth || parseInt(shell.style.width) || window.innerWidth;
    let containerH = shell.clientHeight || parseInt(shell.style.height) || window.innerHeight;
    if (!containerW || !containerH) return;

    const canvasW = 1280;
    const canvasH = 800;
    const scale = Math.min(containerW / canvasW, containerH / canvasH);
    const sw = Math.floor(scale * canvasW);
    const sh = Math.floor(scale * canvasH);
    const mx = Math.floor((containerW - sw) / 2);
    const my = Math.floor((containerH - sh) / 2);

    const canvasEl = shell.querySelector("canvas");
    if (canvasEl) {
        canvasEl.style.width = sw + "px";
        canvasEl.style.height = sh + "px";
        canvasEl.style.marginLeft = mx + "px";
        canvasEl.style.marginRight = mx + "px";
        canvasEl.style.marginTop = my + "px";
        canvasEl.style.marginBottom = my + "px";
    }

    // HTML layer 定位（#ui 在 #root 内部，#root 已是 absolute 撑满 shell，
    // 所以用 left/top 而非 margin，避免撑大 #root 导致错位）
    const htmlLayers: HTMLElement[] = (CanvasManagerStatic as any).htmlLayers || [];
    for (const layer of htmlLayers) {
        layer.style.width = sw + "px";
        layer.style.height = sh + "px";
        layer.style.left = mx + "px";
        layer.style.top = my + "px";
        layer.style.marginLeft = "";
        layer.style.marginRight = "";
        layer.style.marginTop = "";
        layer.style.marginBottom = "";
    }
};

// 兜底：延迟再触发一次 resize，防止手机自带浏览器初始化时 DOM 尚未布局完成
setTimeout(() => {
    try { (CanvasManagerStatic as any).resize(); } catch (_) { /* ignore */ }
}, 200);

// 画布分辨率匹配 PC 端 Electron 窗口 1280x800（16:10）
Game.init(shell, {
    id: HTML_CANVAS_LAYER_NAME,
    height: 800,
    width: 1280,
    backgroundColor: "#303030",
    resizeMode: "contain",
}).then(() => {
    // Pixi.JS UI Layer
    canvas.addLayer(CANVAS_UI_LAYER_NAME, new Container());

    // Sound setup
    sound.addChannel(BGM_CHANNEL_NAME, { background: true });
    sound.addChannel(SFX_CHANNEL_NAME);
    sound.defaultChannelAlias = SFX_CHANNEL_NAME;
    MasterSound.init();
    ChannelSound.init();

    // React setup with ReactDOM
    const root = document.getElementById("root");
    if (!root) {
        throw new Error("root element not found");
    }

    const htmlLayerEl = canvas.addHtmlLayer(HTML_UI_LAYER_NAME, root, { pointerEvents: "auto" });
    if (!htmlLayerEl) {
        throw new Error("htmlLayout not found");
    }
    const reactRoot = createRoot(htmlLayerEl);
    reactRoot.render(<App />);

    // HTML layer 已创建，调用 resize 使其与 canvas 对齐
    (CanvasManagerStatic as any).resize();
});

Game.onEnd(async (props) => {
    // 刹车：跳过/快进只作用于当前这一个 label 段，段演完即停（防止连跳下一段造成无限跳过）
    SkipSettings.setEnabled(false);
    // ① 待衔接标记：探索第 5 次演完 → 直接衔接下一段全屏（跳过回聊天）
    const pendingLink = takePendingAutoLink();
    // ② 当前隐藏剧情记账（谁触发谁记）；⚠ 不要反查引擎 currentLabelId（onEnd 时已清栈）
    const activeHidden = takeActiveHiddenLabel();
    Game.clear();
    // 画布已清空，背景引用一并重置（避免 showCanvasBackground 对已销毁 sprite 误操作）
    clearCurrentBackground();
    if (pendingLink) {
        const target = HIDDEN_LABELS[pendingLink];
        if (target) {
            // 衔接的下一段仍是隐藏剧情：把记账延续过去，保证该段结束也能回聊天页
            setActiveHiddenLabel(activeHidden ?? target);
            // 角标切换到本段编号
            setActiveHiddenSeqFromLabel(target);
            await props.navigate({ to: "/game/narration" });
            await Game.start(target as LabelIdType, props);
            props.invalidateInterfaceData();
            return;
        }
    }
    // 隐藏剧情（含探索小剧情）结束 → 回聊天页继续日常
    if (activeHidden) {
        // 角标熄灭
        clearActiveHiddenSeq();
        props.navigate({ to: "/game/chat" });
        return;
    }
    // 开场设定完成后（玩家填好名字/鲸名/API），剧情结束直接进入「未至之境」聊天界面；
    // 否则（正常回主菜单路径）回到首页主菜单。
    const onboardingDone = SetupStore.store.state.onboardingDone;
    props.navigate({ to: onboardingDone ? "/game/chat" : "/" });
});

Game.addOnError(drawCanvasErrorHandler());
Game.addOnError((error, { toast, uiTransition }) => {
    toast && uiTransition && toast.error(uiTransition("allert_error_occurred"));
    console.error(`Error occurred`, error);
});

Game.onLoadingLabel((_stepId, { id }) => {
    // 仅当该 id 对应 manifest 里的 bundle 时才后台预载；
    // 探索小剧情（explore-s1-*）没有独立 bundle，由 label 内部自行加载所需背景。
    if ((bundleIds as readonly string[]).includes(id)) {
        Assets.backgroundLoadBundle(id);
    }
});
