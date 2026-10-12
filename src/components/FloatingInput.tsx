import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Send, ChevronDown, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMobileKeyboard } from "@/lib/hooks/use-mobile-keyboard";

interface FloatingInputProps {
    visible: boolean;
    placeholder: string;
    /** text 为去掉首尾空白的文本；images 为 data URL 数组（可能为空） */
    onSend: (text: string, images: string[]) => void;
    onDismiss: () => void;
    disabled?: boolean;
}

/** 单条消息最多带几张图 */
const MAX_IMAGES = 4;
/** 压缩后最长边（px）：手机原图动辄数 MB，过大易导致请求慢/超时 */
const MAX_IMAGE_SIDE = 1280;

/**
 * 读取图片并等比压缩为 JPEG data URL。
 * 注意：刻意不用 createImageBitmap / OffscreenCanvas——旧 Android WebView（Chromium 91）不一定支持。
 */
async function fileToCompressedDataUrl(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("解析图片失败"));
        el.src = dataUrl;
    });

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * 浮动输入面板：独立于游戏画布，position:fixed 贴在底部，
 * 键盘弹起时自动上移（通过 bottom 偏移），游戏画布纹丝不动。
 * 使用 createPortal 挂到 document.body，不受 #mobile-shell CSS 影响。
 */
export function FloatingInput({ visible, placeholder, onSend, onDismiss, disabled }: FloatingInputProps) {
    const keyboardHeight = useMobileKeyboard();
    const [text, setText] = useState("");
    const [images, setImages] = useState<string[]>([]);
    const [reading, setReading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // 每次打开自动聚焦，并清空上一轮的草稿
    useEffect(() => {
        if (visible) {
            setText("");
            setImages([]);
            // 等 portal DOM 挂载完成再聚焦
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [visible]);

    if (!visible) return null;

    const canSend = (text.trim().length > 0 || images.length > 0) && !disabled && !reading;

    const handleSend = () => {
        if (!canSend) return;
        onSend(text.trim(), images);
        setText("");
        setImages([]);
    };

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        // 清空 value，否则连续选同一张图不会再触发 change
        e.target.value = "";
        if (files.length === 0) return;

        setReading(true);
        try {
            const room = Math.max(0, MAX_IMAGES - images.length);
            const picked = await Promise.all(files.slice(0, room).map(fileToCompressedDataUrl));
            setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
        } catch {
            // 单张读取失败就跳过，不打断输入
        } finally {
            setReading(false);
        }
    };

    return createPortal(
        <div
            className="fixed left-0 right-0 z-[1000] bg-background/95 backdrop-blur-md border-t"
            style={{
                bottom: `${keyboardHeight}px`,
                transition: keyboardHeight > 0 ? "bottom 0.3s ease-out" : "none",
            }}
        >
            {/* 已选图片预览（发送前可逐张移除） */}
            {images.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto px-4 pt-3">
                    {images.map((src, i) => (
                        <div key={i} className="relative shrink-0">
                            <img
                                src={src}
                                alt="待发送图片"
                                className="h-16 w-16 rounded-md border object-cover"
                            />
                            <button
                                type="button"
                                aria-label="移除这张图片"
                                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
                                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2 px-4 py-3">
                {/* 向下箭头：关闭面板 */}
                <button
                    onClick={onDismiss}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-colors"
                    aria-label="关闭输入"
                    type="button"
                >
                    <ChevronDown className="size-4" />
                </button>

                <Input
                    ref={inputRef}
                    value={text}
                    placeholder={reading ? "正在处理图片……" : placeholder}
                    disabled={disabled}
                    enterKeyHint="send"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    onChange={(e) => setText(e.target.value)}
                    className="flex-1"
                />

                {/* 选图：交给系统相册/相机选择器 */}
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePick}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="bg-neutral-200/90 text-neutral-900 hover:bg-neutral-300/90"
                    disabled={disabled || reading || images.length >= MAX_IMAGES}
                    aria-label="添加图片"
                    title={images.length >= MAX_IMAGES ? `最多 ${MAX_IMAGES} 张` : "添加图片"}
                    onClick={() => fileRef.current?.click()}
                >
                    <ImagePlus className="size-4" />
                </Button>

                <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    size="sm"
                    className="bg-neutral-200/90 text-neutral-900 hover:bg-neutral-300/90"
                    aria-label="发送"
                >
                    <Send className="size-4" />
                </Button>
            </div>
        </div>,
        document.body,
    );
}
