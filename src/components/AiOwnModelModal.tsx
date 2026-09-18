import { useEffect, useState } from 'react';
import { X, Loader2, Trash2 } from 'lucide-react';
import { STORAGE_KEYS } from '@/config/constants';

/**
 * 个人模型配置弹窗（员工自助，BYOD）。
 * - 填写 OpenAI 兼容的 Base URL / API Key / 模型名并保存后，AI 对话改走本人凭据，
 *   不占用系统每日额度，也不受系统提示词范围约束；功能开关由管理员在 AI 助手配置中控制。
 * - apiKey 仅在本页提交一次；回显只见脱敏值，留空表示不修改。
 */
interface Props {
  onClose: () => void;
  /** 保存/删除成功后回调（用于刷新 status）。 */
  onChanged: () => void;
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary';

export default function AiOwnModelModal({ onClose, onChanged }: Props) {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai/me/config', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setBaseUrl(j.baseUrl ?? '');
          setModel(j.model ?? '');
          setApiKeySet(!!j.apiKeySet);
          setApiKeyMasked(j.apiKeyMasked ?? '');
        }
      })
      .catch(() => setErr('读取已保存的配置失败'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, string> = { baseUrl: baseUrl.trim(), model: model.trim() };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (!body.baseUrl || !body.model || (!apiKeySet && !body.apiKey)) {
        throw new Error('请填写 Base URL、模型名与 API Key');
      }
      const res = await fetch('/api/ai/me/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `保存失败（${res.status}）`);
      onChanged();
      onClose();
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setErr(null);
    try {
      await fetch('/api/ai/me/config', { method: 'DELETE', headers: authHeaders() });
      setBaseUrl('');
      setModel('');
      setApiKey('');
      setApiKeySet(false);
      setApiKeyMasked('');
      onChanged();
    } catch {
      setErr('清除失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="个人模型配置"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">个人模型配置</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          使用本人凭据调用自选的 OpenAI 兼容模型。配置齐全后，对话将通过个人模型进行，
          不占用系统每日额度；未配置或信息不完整时，仍使用系统模型并受额度限制。
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">API Base URL</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">模型名</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeySet ? `已保存（${apiKeyMasked}），留空则不修改` : 'sk-…'}
                autoComplete="off"
                className={inputCls}
              />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}

            <div className="flex items-center justify-between pt-1">
              {apiKeySet || baseUrl || model ? (
                <button
                  type="button"
                  onClick={clear}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  清除配置
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
