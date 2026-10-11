import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMobileKeyboard } from "@/lib/hooks/use-mobile-keyboard";

interface FloatingInputProps {
    visible: boolean;
    placeholder: string;
    onSend: (text: string) => void;
    onDismiss: () => void;
    disabled?: boolean;
}

/**
 * 浮动输入面板：独立于游戏画布，position:fixed 贴在底部，
 * 键盘弹起时自动上移（通过 bottom 偏移），游戏画布纹丝不动。
 * 使用 createPortal 挂到 document.body，不受 #mobile-shell CSS 影响。
 */
export function FloatingInput({ visible, placeholder, onSend, onDismiss, disabled }: FloatingInputProps) {
    const keyboardHeight = useMobileKeyboard();
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // 每次打开自动聚焦
    useEffect(() => {
        if (visible) {
            setText("");
            // 等 portal DOM 挂载完成再聚焦
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [visible]);

    if (!visible) return null;

    const handleSend = () => {
        const content = text.trim();
        if (!content || disabled) return;
        onSend(content);
        setText("");
    };

    return createPortal(
        <div
            className="fixed left-0 right-0 z-[1000] bg-background/95 backdrop-blur-md border-t"
            style={{
                bottom: `${keyboardHeight}px`,
                transition: keyboardHeight > 0 ? "bottom 0.3s ease-out" : "none",
            }}
        >
            <div className="flex items-center gap-2 px-4 py-3">
                {/* 右上角向下箭头：关闭面板 */}
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
                    placeholder={placeholder}
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
                <Button onClick={handleSend} disabled={disabled || !text.trim()} size="sm">
                    <Send className="size-4" />
                </Button>
            </div>
        </div>,
        document.body,
    );
}