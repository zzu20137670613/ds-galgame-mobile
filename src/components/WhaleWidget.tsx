import { useState, useRef, useCallback, useEffect } from "react"
import { useSelector } from "@tanstack/react-store"
import { SetupStore } from "@/lib/stores/setup-store"
import { WhaleBalance, currentPricingMode, formatCountdown, nextPricingSwitch } from "@/lib/utils/whale-balance"
import type { BalanceSummary } from "@/lib/utils/whale-accounting"
import { cn } from "@/lib/utils"

interface Position {
  x: number
  y: number
}

/** 横屏纠正：部分手机浏览器/WebView 报告的宽高仍是竖屏值（宽<高）。 */
function toLandscape(w: number, h: number): { w: number; h: number } {
  return { w: Math.max(w, h), h: Math.min(w, h) }
}

/**
 * 夹取用的可用视口尺寸。
 * 桌宠是 position:fixed，坐标系就是视口本身。这里对若干来源各自做横屏纠正后，
 * 宽高各取最小值——宁可让它稍微靠内，也不能因为某个来源数值偏大而被算到屏幕外。
 * （不能用 #mobile-shell：它的 maxShellW/H 缓存只增不减，可能大于真实视口。）
 */
function getViewportSize(): { w: number; h: number } {
  const cands: { w: number; h: number }[] = []
  const de = document.documentElement
  if (de && de.clientWidth > 0 && de.clientHeight > 0) {
    cands.push(toLandscape(de.clientWidth, de.clientHeight))
  }
  if (window.innerWidth > 0 && window.innerHeight > 0) {
    cands.push(toLandscape(window.innerWidth, window.innerHeight))
  }
  if (cands.length === 0) return { w: 320, h: 240 } // 极端兜底
  return {
    w: Math.min(...cands.map((c) => c.w)),
    h: Math.min(...cands.map((c) => c.h)),
  }
}

/** 桌宠默认位置：右下角锚定（避开安全区域，兼容刘海/手势条）。
 *  用 CSS 让浏览器自己算，不依赖任何 JS 尺寸测量。 */
const ANCHORED_STYLE = {
  right: "calc(16px + env(safe-area-inset-right, 0px))",
  bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
} as const

export function WhaleWidget() {
  const apiKey = useSelector(SetupStore.store, (s) => s.apiKey)
  const whaleName = useSelector(SetupStore.store, (s) => s.whaleName || "鲸鲸")
  const whaleState = useSelector(WhaleBalance.store, (s) => s)

  const [expanded, setExpanded] = useState(false)
  // null = 未拖拽过：用 CSS 右下角锚定（最稳，不依赖 JS 测量尺寸）
  const [pos, setPos] = useState<Position | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  /** 峰谷倒计时的"当前秒"：只在气泡展开时逐秒走（收起时不空转） */
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  const clampPos = useCallback((x: number, y: number): Position => {
    const w = widgetRef.current?.offsetWidth || 110
    const h = widgetRef.current?.offsetHeight || 130
    const { w: vw, h: vh } = getViewportSize()
    return {
      x: Math.max(0, Math.min(x, vw - w)),
      y: Math.max(0, Math.min(y, vh - h)),
    }
  }, [])

  useEffect(() => {
    // 只有「用户拖拽过」才用像素坐标（并做边界夹取，旧版本存下的屏幕外坐标可自愈）；
    // 否则交给 CSS 右下角锚定——默认位置完全不依赖 JS 尺寸测量，
    // 从根上避免真机上因视口数值误报而被算到屏幕外（桌宠「消失」）。
    const saved = localStorage.getItem("gal_whale_pos")
    if (saved) {
      try {
        const p = JSON.parse(saved)
        if (typeof p.x === "number" && typeof p.y === "number") {
          setPos(clampPos(p.x, p.y))
          return
        }
      } catch { /* ignore */ }
    }
    setPos(null)
  }, [clampPos])

  // 旋转屏幕 / 视口尺寸变化时把「已拖拽过」的桌宠拉回可视区
  useEffect(() => {
    const reclamp = () => setPos((p) => (p ? clampPos(p.x, p.y) : p))
    window.addEventListener("resize", reclamp)
    window.addEventListener("orientationchange", reclamp)
    return () => {
      window.removeEventListener("resize", reclamp)
      window.removeEventListener("orientationchange", reclamp)
    }
  }, [clampPos])

  useEffect(() => {
    WhaleBalance.startPolling(() => apiKey)
    return () => WhaleBalance.stopPolling()
  }, [apiKey])

  // 峰谷倒计时：展开时每秒刷新一次（切换点本身由 whale-balance 按官方峰谷规则算）
  useEffect(() => {
    if (!expanded) return
    setNowSec(Math.floor(Date.now() / 1000))
    const timer = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [expanded])

  const persistPos = useCallback((p: Position) => {
    localStorage.setItem("gal_whale_pos", JSON.stringify(p))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 默认是 CSS 锚定（pos 为 null），拖拽前先从实际渲染位置取一次起点
    const rect = widgetRef.current?.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos ? pos.x : (rect?.left ?? 0),
      startPosY: pos ? pos.y : (rect?.top ?? 0),
    }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const next = () =>
      clampPos(dragRef.current!.startPosX + dx, dragRef.current!.startPosY + dy)

    if (dragging) {
      setPos(next())
      return
    }

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setDragging(true)
      setExpanded(false)
      // 一开始拖动就切到像素定位，避免只移动一次就松手时位置丢失
      setPos(next())
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [dragging, clampPos])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragging) {
      setDragging(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
      if (pos) persistPos(pos)
      dragRef.current = null
      return
    }
    dragRef.current = null
    setExpanded(prev => !prev)
  }, [dragging, pos, persistPos])

  const summary: BalanceSummary | null = whaleState.summary
  const balance = summary?.currentBalance ?? whaleState.ledger.lastBalance
  const todayUsage = summary?.amount ?? whaleState.ledger.todayUsage
  const pricingMode = whaleState.pricingMode
  const loading = whaleState.loading
  const error = whaleState.error

  /**
   * 下一个峰谷切换点（随 nowSec 每秒重算）。
   * 规则走 whale-balance 里那套官方峰谷判定（含周末与节假日豁免），
   * 所以"时段"那一行和这里的倒计时永远指向同一件事。
   */
  const nextSwitch = nextPricingSwitch(nowSec)
  const costTarget = nextSwitch.target
  const costRemainSec = nextSwitch.nextAt - nowSec
  const costTargetLabel = costTarget === "peak" ? "高峰" : "空闲"

  if (!apiKey) return null

  return (
    <div
      ref={widgetRef}
      className={cn(
        "fixed z-[9999] select-none transition-transform duration-200",
        dragging ? "scale-110 cursor-grabbing" : "cursor-grab",
        expanded && "scale-105"
      )}
      style={{
        // 未拖拽过：CSS 右下角锚定（含安全区域），由浏览器计算，不依赖 JS 测量
        // 已拖拽过：使用拖拽保存的像素坐标（已做边界夹取）
        ...(pos ? { left: pos.x, top: pos.y } : ANCHORED_STYLE),
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 挂件立绘：直接就是桌宠那张初始立绘（idle-cute），不再裁成圆形头像 */}
      <img
        src="/assets/whale/whale-idle.webp"
        alt={whaleName}
        className={cn(
          "pointer-events-none w-[110px] h-auto transition-[filter] duration-200",
          pricingMode === "peak"
            ? "drop-shadow-[0_0_10px_rgba(251,146,60,0.55)]"
            : "drop-shadow-[0_0_10px_rgba(96,165,250,0.55)]",
          loading && "animate-pulse"
        )}
        draggable={false}
      />

      {/* 峰谷小角标 */}
      <span className={cn(
        "absolute -top-1 -right-1 w-4 h-4 rounded-full border border-white text-[10px] flex items-center justify-center font-bold",
        pricingMode === "peak" ? "bg-orange-500" : "bg-blue-500",
      )}>
        {pricingMode === "peak" ? "峰" : "谷"}
      </span>

      {/* 余额信息气泡 */}
      {expanded && (
        <div className="absolute bottom-full mb-2 right-0 w-48 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 text-white text-sm shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs">{whaleName} · API余额</span>
            <button
              className="text-slate-500 hover:text-slate-300 text-xs"
              onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
            >
              ✕
            </button>
          </div>

          {error ? (
            <div className="text-red-400 text-xs">{error}</div>
          ) : (
            <>
              <div className="text-2xl font-bold text-emerald-400">
                ¥{balance.toFixed(2)}
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>今日已用</span>
                <span className="text-amber-400">¥{todayUsage.toFixed(4)}</span>
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>时段</span>
                <span className={pricingMode === "peak" ? "text-orange-400" : "text-blue-400"}>
                  {pricingMode === "peak" ? "🔴 高峰" : "🔵 空闲"}
                </span>
              </div>
              {/* 峰谷倒计时：指向下一个时段切换点（和桌宠悬停浮层同一套规则） */}
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>距{costTargetLabel}</span>
                <span className={costTarget === "peak" ? "text-orange-400" : "text-blue-400"}>
                  {formatCountdown(costRemainSec)}
                </span>
              </div>
            </>
          )}

          {loading && (
            <div className="mt-2 flex justify-center">
              <div className="w-4 h-4 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* 拖动提示 */}
      {!dragging && !expanded && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          长按拖动 | 点击查看
        </div>
      )}
    </div>
  )
}