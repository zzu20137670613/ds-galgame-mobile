import { useState, useRef, useCallback, useEffect } from "react"
import { useSelector } from "@tanstack/react-store"
import { SetupStore } from "@/lib/stores/setup-store"
import { WhaleBalance, currentPricingMode } from "@/lib/utils/whale-balance"
import type { BalanceSummary } from "@/lib/utils/whale-accounting"
import { cn } from "@/lib/utils"

interface Position {
  x: number
  y: number
}

/**
 * 可用视口尺寸。
 * 与 main.tsx 的 updateShellSize 保持同一套逻辑：部分手机浏览器/WebView 报告的
 * window.innerWidth/innerHeight 仍是竖屏值（横屏时宽<高），直接拿来算坐标会把
 * 桌宠放到屏幕外（真机上表现为"桌宠不见了"）。
 * 优先取真实游戏容器 #mobile-shell 的尺寸，取不到再用「宽取大、高取小」兜底。
 */
function getViewportSize(): { w: number; h: number } {
  const shell = document.getElementById("mobile-shell")
  const sw = shell?.clientWidth || parseInt(shell?.style.width || "", 10) || 0
  const sh = shell?.clientHeight || parseInt(shell?.style.height || "", 10) || 0
  if (sw > 0 && sh > 0) return { w: sw, h: sh }
  return {
    w: Math.max(window.innerWidth, window.innerHeight),
    h: Math.min(window.innerWidth, window.innerHeight),
  }
}

export function WhaleWidget() {
  const apiKey = useSelector(SetupStore.store, (s) => s.apiKey)
  const whaleName = useSelector(SetupStore.store, (s) => s.whaleName || "鲸鲸")
  const whaleState = useSelector(WhaleBalance.store, (s) => s)

  const [expanded, setExpanded] = useState(false)
  const [pos, setPos] = useState<Position>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  const clampPos = useCallback((x: number, y: number): Position => {
    const w = widgetRef.current?.offsetWidth || 64
    const h = widgetRef.current?.offsetHeight || 64
    const { w: vw, h: vh } = getViewportSize()
    return {
      x: Math.max(0, Math.min(x, vw - w)),
      y: Math.max(0, Math.min(y, vh - h)),
    }
  }, [])

  useEffect(() => {
    // 读档位置与默认位置都要做边界夹取：
    // ① 旧版本存的坐标可能是竖屏时算出来的，横屏下落在屏幕外 → 桌宠「消失」；
    // ② 默认位置改用 getViewportSize，避免横竖屏数值误报导致算出屏幕外的坐标。
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
    const { w: vw, h: vh } = getViewportSize()
    setPos(clampPos(vw - 80, vh - 120))
  }, [clampPos])

  // 旋转屏幕 / 视口尺寸变化时把桌宠拉回可视区，避免横竖屏切换后跑到屏幕外
  useEffect(() => {
    const reclamp = () => setPos((p) => clampPos(p.x, p.y))
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

  const persistPos = useCallback((p: Position) => {
    localStorage.setItem("gal_whale_pos", JSON.stringify(p))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY

    if (dragging) {
      setPos(clampPos(dragRef.current.startPosX + dx, dragRef.current.startPosY + dy))
      return
    }

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setDragging(true)
      setExpanded(false)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [dragging, clampPos])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragging) {
      setDragging(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
      persistPos(pos)
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
        left: pos.x,
        top: pos.y,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 鲸鱼娘图标 */}
      <div className={cn(
        "w-16 h-16 rounded-full overflow-hidden shadow-lg border-2 transition-colors",
        pricingMode === "peak" ? "border-orange-400 shadow-orange-400/30" : "border-blue-400 shadow-blue-400/30",
        loading && "animate-pulse"
      )}>
        <img
          src="/assets/whale/whale-char.png"
          alt={whaleName}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>

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