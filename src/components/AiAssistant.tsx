import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Square, Plus, History, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import { useAiChat } from '@/hooks/useAiChat';
import { resolveAiIcon, resolveAiName } from '@/config/aiIcons';

/**
 * 流式回复中的打字指示器。
 */
function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 px-1" aria-label="AI 正在生成回复">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

/**
 * AI 助手悬浮组件。
 * - 右下角悬浮入口，点击展开聊天面板。
 * - 复用 useAiChat：SSE 流式、会话持久化、按 /api/ai/status 显隐与默认读数据开关。
 * - 历史对话抽屉：新建 / 切换 / 删除对话。
 * - 仅登录后外壳（Layout）挂载，未登录不会出现。
 */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const {
    messages,
    conversations,
    activeId,
    streaming,
    useData,
    setUseData,
    aiEnabled,
    assistantName,
    assistantIcon,
    hasLogo,
    assistantDraggable,
    send,
    newChat,
    selectConversation,
    removeConversation,
    stop,
  } = useAiChat();
  const AssistantIcon = resolveAiIcon(assistantIcon);
  const assistantLabel = resolveAiName(assistantName);
  const scrollRef = useRef<HTMLDivElement>(null);

  // —— 悬浮入口自由拖动（贴右侧上下移动）——
  const BTN_H = 56; // h-14 = 3.5rem = 56px
  const FLOAT_KEY = 'ams_ai_float_y';
  const clampTop = (y: number) => {
    const min = 12;
    const max = (typeof window !== 'undefined' ? window.innerHeight : 800) - BTN_H - 12;
    return Math.max(min, Math.min(max, y));
  };
  const [floatY, setFloatY] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(FLOAT_KEY);
    if (saved) {
      const n = Number(saved);
      if (!Number.isNaN(n)) return clampTop(n);
    }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ y: number; top: number } | null>(null);
  const dragMoved = useRef(false);

  // 开启拖动时：有已存位置用已存值，否则用贴近右下角的默认停靠点（渲染期派生，避免 effect 内 setState）
  const isFloatable = assistantDraggable;
  const effectiveY =
    floatY != null
      ? floatY
      : assistantDraggable
        ? clampTop((typeof window !== 'undefined' ? window.innerHeight : 800) - BTN_H - 24)
        : null;

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isFloatable) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    dragStart.current = { y: e.clientY, top: rect.top };
    dragMoved.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return;
    const delta = e.clientY - dragStart.current.y;
    if (Math.abs(delta) > 3) dragMoved.current = true;
    setFloatY(clampTop(dragStart.current.top + delta));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
    dragStart.current = null;
    setDragging(false);
    if (floatY != null) {
      try {
        window.localStorage.setItem(FLOAT_KEY, String(floatY));
      } catch {
        /* 忽略 */
      }
    }
  };
  const onButtonClick = () => {
    // 拖动后松手会触发 click，这里吞掉以免误打开面板
    if (isFloatable && dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setOpen((v) => !v);
  };

  /** 入口图标：若配置了自定义 Logo 则显示图片，否则用内置图标。 */
  const renderGlyph = (sizeClass: string) =>
    hasLogo ? (
      <img
        src="/api/ai/logo"
        alt={assistantLabel}
        width={40}
        height={40}
        className={`${sizeClass} rounded-full object-cover`}
      />
    ) : (
      <AssistantIcon className={sizeClass} />
    );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    send(input, useData);
    setInput('');
  };

  const handleClose = () => {
    setOpen(false);
    newChat();
  };

  return (
    <>
      {/* 悬浮入口按钮 */}
      <button
        type="button"
        onClick={onButtonClick}
        onPointerDown={isFloatable ? onPointerDown : undefined}
        onPointerMove={isFloatable ? onPointerMove : undefined}
        onPointerUp={isFloatable ? onPointerUp : undefined}
        aria-label="打开 AI 助手"
        title={isFloatable ? "拖动可上下调整位置，点击打开" : "打开 AI 助手"}
        style={isFloatable && effectiveY != null ? { top: effectiveY, right: 24, touchAction: 'none' } : undefined}
        className={
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95" +
          (isFloatable ? " cursor-grab" : " bottom-6 right-6") +
          (dragging ? " cursor-grabbing" : "")
        }
      >
        {renderGlyph("h-9 w-9")}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={isFloatable && effectiveY != null ? { bottom: `calc(100vh - ${effectiveY}px + 12px)` } : undefined}
            className="fixed bottom-24 right-6 z-50 flex h-[560px] max-h-[80vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                {renderGlyph("h-4 w-4")}
                <span className="text-sm font-semibold">{assistantLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-label="历史对话"
                  aria-pressed={showHistory}
                  className={`rounded-md p-1.5 transition-colors ${
                    showHistory
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="关闭"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 主体：历史抽屉 + 消息 */}
            <div className="flex min-h-0 flex-1">
              {/* 历史对话抽屉 */}
              <AnimatePresence initial={false}>
                {showHistory && (
                  <motion.aside
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 140, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="shrink-0 overflow-hidden border-r border-border bg-muted/40"
                  >
                    <div className="flex h-full w-[140px] flex-col">
                      <button
                        type="button"
                        onClick={() => {
                          newChat();
                          setShowHistory(false);
                        }}
                        className="m-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新建对话
                      </button>
                      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                        {conversations.length === 0 && (
                          <p className="px-1 pt-4 text-center text-xs text-muted-foreground">
                            暂无历史对话
                          </p>
                        )}
                        {conversations.map((c) => (
                          <div
                            key={c.id}
                            className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                              c.id === activeId
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                selectConversation(c.id);
                                setShowHistory(false);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="truncate">{c.title || '新对话'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeConversation(c.id)}
                              aria-label="删除对话"
                              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>

              {/* 消息区 */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div
                  ref={scrollRef}
                  className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
                >
                  {!aiEnabled && (
                    <div className="mt-8 text-center text-xs text-muted-foreground">
                      AI 助手已关闭（管理员设置）
                    </div>
                  )}
                  {aiEnabled && messages.length === 0 && (
                    <div className="mt-8 text-center text-muted-foreground">
                      {renderGlyph("mx-auto mb-2 h-8 w-8 opacity-60")}
                      <p>你好，我是 {assistantLabel}。</p>
                      <p className="mt-1 text-xs">
                        问问人事、考勤、文档等行政问题吧。
                      </p>
                    </div>
                  )}

                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                      }
                    >
                      <div
                        className={
                          m.role === 'user'
                            ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground'
                            : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-foreground'
                        }
                      >
                        {m.content ? (
                          m.content
                        ) : streaming && i === messages.length - 1 ? (
                          <TypingIndicator />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 底部：开关 + 输入 */}
                <div className="border-t border-border px-4 py-3">
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={useData}
                      disabled={streaming}
                      onChange={(e) => setUseData(e.target.checked)}
                      className="h-3.5 w-3.5 accent-primary disabled:opacity-40"
                    />
                    读取业务数据（基于系统现有数据回答）
                  </label>

                  {streaming && (
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>AI 正在生成回复…</span>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      rows={1}
                      disabled={!aiEnabled || streaming}
                      placeholder={
                        !aiEnabled
                          ? 'AI 助手已关闭'
                          : streaming
                          ? 'AI 正在回复，请稍候…'
                          : '输入问题，Enter 发送…'
                      }
                      className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
                    />
                    {streaming ? (
                      <button
                        type="button"
                        onClick={stop}
                        aria-label="停止"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors hover:bg-muted/70"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={!input.trim() || !aiEnabled}
                        aria-label="发送"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
