import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { STORAGE_KEYS } from '@/config/constants';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

function token(): string | null {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

function authHeaders(): Record<string, string> {
  const t = token();
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/**
 * AI 助手对话 hook（无第三方依赖）。
 *
 * 能力：
 * - 调用 POST /api/ai/chat（SSE 流式，打字机效果），鉴权 token 从 localStorage 读取。
 * - 会话持久化：从 /api/ai/conversations 拉取列表、新建/切换/删除对话，
 *   每条消息落库（按 username 隔离，跨用户不可见）。
 * - 读取 /api/ai/status 获取「是否启用」「默认是否读业务数据」，控制入口显隐与默认开关。
 */
export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [useData, setUseData] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [assistantName, setAssistantName] = useState('');
  const [assistantIcon, setAssistantIcon] = useState('');
  const [hasLogo, setHasLogo] = useState(false);
  const [assistantDraggable, setAssistantDraggable] = useState(false);
  // 额度与个人模型状态（来自 /api/ai/status，发送后刷新）
  const [dailyQuota, setDailyQuota] = useState(0);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [hasOwnModel, setHasOwnModel] = useState(false);
  const [allowPersonalModel, setAllowPersonalModel] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const refreshStatus = useCallback(() => {
    return fetch('/api/ai/status', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setAiEnabled(!!j.enabled);
          if (typeof j.useDataDefault === 'boolean') setUseData(j.useDataDefault);
          if (typeof j.assistantName === 'string') setAssistantName(j.assistantName);
          if (typeof j.assistantIcon === 'string') setAssistantIcon(j.assistantIcon);
          if (typeof j.hasLogo === 'boolean') setHasLogo(j.hasLogo);
          if (typeof j.assistantDraggable === 'boolean') setAssistantDraggable(j.assistantDraggable);
          if (typeof j.dailyQuota === 'number') setDailyQuota(j.dailyQuota);
          if (typeof j.quotaUsed === 'number') setQuotaUsed(j.quotaUsed);
          if (typeof j.hasOwnModel === 'boolean') setHasOwnModel(j.hasOwnModel);
          if (typeof j.allowPersonalModel === 'boolean') setAllowPersonalModel(j.allowPersonalModel);
        }
      })
      .catch(() => {});
  }, []);

  // 读取全局开关 / 默认读数据 / 额度
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const refreshConversations = useCallback(() => {
    fetch('/api/ai/conversations', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ConversationMeta[]) => setConversations(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (aiEnabled) refreshConversations();
  }, [aiEnabled, refreshConversations]);

  /** 会话落库。失败必须说出来：不然用户以为历史存住了，下次打开是一片空白 */
  const persist = useCallback(
    async (full: ChatMessage[], userText: string) => {
      const t = token();
      if (!t) return;
      const title = userText.trim().slice(0, 30) || '新对话';
      try {
        if (activeIdRef.current) {
          const res = await fetch(`/api/ai/conversations/${activeIdRef.current}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ title, messages: full }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
          const res = await fetch('/api/ai/conversations', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ title, messages: full }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { id: string };
          activeIdRef.current = j.id;
          setActiveId(j.id);
        }
        refreshConversations();
      } catch {
        toast.error('对话未能保存到服务端');
      }
    },
    [refreshConversations]
  );

  const send = useCallback(
    async (text: string, useDataFlag: boolean) => {
      const content = text.trim();
      if (!content || streaming) return;

      const history: ChatMessage[] = [
        ...messages,
        { role: 'user', content },
      ];
      // assistant 内容在本地累积，再由 paint 整体覆盖画面。
      // 副作用不能写进 setMessages 的 updater（StrictMode 会把 updater 调两次 → 发两次落库请求，
      // 留下一条只存在一半的孤儿会话），而落库要的正是这份最终完整内容。
      let assistantText = '';
      const paint = () => setMessages([...history, { role: 'assistant', content: assistantText }]);
      paint();
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ messages: history, useData: useDataFlag }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '');
          assistantText = `[请求失败] ${res.status} ${errText}`;
          paint();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const evt = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = evt.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]' || data === '') continue;
            try {
              const j = JSON.parse(data);
              if (typeof j.content === 'string' && j.content) {
                assistantText += j.content;
                paint();
              } else if (j.error) {
                assistantText = `⚠️ ${j.error}`;
                paint();
              }
            } catch {
              /* 跳过无法解析的分片 */
            }
          }
        }
      } catch (e: unknown) {
        const name = (e as { name?: string })?.name;
        if (name !== 'AbortError') {
          assistantText = '⚠️ 网络错误，请稍后重试';
          paint();
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // 用最终完整消息落库（含已流式填充的 assistant 内容）
        void persist([...history, { role: 'assistant', content: assistantText }], content);
        // 刷新额度计数 / 个人模型状态
        void refreshStatus();
      }
    },
    [messages, streaming, persist, refreshStatus]
  );

  const newChat = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    setMessages([]);
  }, []);

  const selectConversation = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const conv = (await res.json()) as { messages: ChatMessage[]; title: string };
        activeIdRef.current = id;
        setActiveId(id);
        setMessages(Array.isArray(conv.messages) ? conv.messages : []);
      } catch {
        // 点了历史条目却什么都不发生，和按钮坏掉没区别
        toast.error('这条对话打不开');
      }
    },
    []
  );

  const removeConversation = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        toast.error('删除失败，这条对话还在');
        return;
      }
      if (activeIdRef.current === id) newChat();
      refreshConversations();
    },
    [newChat, refreshConversations]
  );

  const reset = useCallback(() => setMessages([]), []);
  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return {
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
    dailyQuota,
    quotaUsed,
    hasOwnModel,
    allowPersonalModel,
    refreshStatus,
    send,
    newChat,
    selectConversation,
    removeConversation,
    reset,
    stop,
  };
}
