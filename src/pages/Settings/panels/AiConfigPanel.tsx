import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Save, Bot, RotateCcw, RefreshCw, Upload, Image as ImageIcon, X } from 'lucide-react';
import { STORAGE_KEYS } from '@/config/constants';
import { AI_ICON_OPTIONS, resolveAiIcon, DEFAULT_AI_NAME } from '@/config/aiIcons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * AI 助手配置（仅超级管理员可见）。
 * 配置存于后端 ai_config 表（DB + 环境变量合并），保存后立即生效，无需重启。
 * 模型名支持从服务商 /models 端点拉取后下拉选择；助手名称与图标也可在此自定义。
 */
interface ConfigForm {
  enabled: boolean;
  allowNonAdmin: boolean;
  useDataDefault: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  assistantName: string;
  assistantIcon: string;
  assistantLogo: string;
  assistantDraggable: boolean;
  conversationRetentionDays: number;
}

const EMPTY: ConfigForm = {
  enabled: true,
  allowNonAdmin: true,
  useDataDefault: false,
  baseUrl: '',
  model: '',
  apiKey: '',
  systemPrompt: '',
  assistantName: '',
  assistantIcon: '',
  assistantLogo: '',
  assistantDraggable: false,
  conversationRetentionDays: 0,
};

/** Logo 文件大小上限（约 1.5MB）。 */
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-border/80 dark:border-border rounded-lg bg-muted dark:bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all duration-200';

export default function AiConfigPanel() {
  const [form, setForm] = useState<ConfigForm>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 模型列表（从服务商端点拉取）
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [modelErr, setModelErr] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/ai/config', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setForm({
            enabled: !!j.enabled,
            allowNonAdmin: !!j.allowNonAdmin,
            useDataDefault: !!j.useDataDefault,
            baseUrl: j.baseUrl ?? '',
            model: j.model ?? '',
            systemPrompt: j.systemPrompt ?? '', // 后端回显已保存的提示词（非敏感）
            assistantName: j.assistantName ?? '',
            assistantIcon: j.assistantIcon ?? '',
            assistantLogo: j.assistantLogo ?? '',
            assistantDraggable: !!j.assistantDraggable,
            conversationRetentionDays: Number(j.conversationRetentionDays) || 0,
            apiKey: '', // 后端返回脱敏值；用户不填则保留原值
          });
          setLoaded(true);
        }
      })
      .catch(() => setMsg({ type: 'err', text: '读取配置失败' }));
  }, []);

  const update = (patch: Partial<ConfigForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setMsg({ type: 'err', text: '仅支持 PNG / JPEG / WebP / GIF / SVG 图片' });
      e.target.value = '';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMsg({ type: 'err', text: 'Logo 图片过大，请控制在 1.5MB 以内' });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') update({ assistantLogo: reader.result });
    };
    reader.onerror = () => setMsg({ type: 'err', text: '读取图片失败' });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const fetchModels = async () => {
    if (!form.baseUrl.trim()) {
      setModelErr('请先填写 API Base URL');
      return;
    }
    setFetching(true);
    setModelErr(null);
    try {
      const q = `/api/ai/models?baseUrl=${encodeURIComponent(
        form.baseUrl.trim()
      )}&apiKey=${encodeURIComponent(form.apiKey.trim())}`;
      const r = await fetch(q, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `获取失败（${r.status}）`);
      const list: string[] = Array.isArray(j.models) ? j.models : [];
      setModels(list);
      if (list.length === 0) {
        setModelErr('服务商未返回可用模型，可手动输入');
        setCustomModel(true);
      } else {
        setCustomModel(false); // 显示下拉
        // 获取到列表后自动选中：保留当前值（若在列表中），否则选第一个，避免占位符一直显示
        const current = form.model.trim();
        if (!current || !list.includes(current)) {
          update({ model: list[0] });
        }
      }
    } catch (e: unknown) {
      setModelErr((e as { message?: string })?.message || '获取失败');
      setModels([]);
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        enabled: form.enabled,
        allowNonAdmin: form.allowNonAdmin,
        useDataDefault: form.useDataDefault,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        systemPrompt: form.systemPrompt,
        assistantName: form.assistantName.trim(),
        assistantIcon: form.assistantIcon.trim(),
        assistantLogo: form.assistantLogo,
        assistantDraggable: form.assistantDraggable,
        conversationRetentionDays: Number(form.conversationRetentionDays) || 0,
      };
      // 仅当用户确实输入了新 key 才覆盖；留空则不动原值
      if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();

      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `保存失败（${res.status}）`);
      }
      setMsg({ type: 'ok', text: '已保存，配置即时生效' });
      setForm((f) => ({ ...f, apiKey: '' })); // 清空输入框，避免重复提交
    } catch (e: unknown) {
      setMsg({ type: 'err', text: (e as { message?: string })?.message || '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY);
    setModels([]);
    setCustomModel(false);
    setModelErr(null);
  };

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300 space-y-6">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          AI 助手配置
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          配置接入的大模型与可用范围。保存后立即生效，无需重启服务。
        </p>
      </div>

      {/* 可用范围 */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-4">
        <h3 className="subsection-title">可用范围</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SwitchRow
            label="启用 AI 助手"
            desc="关闭后所有用户都无法使用 AI 助手"
            checked={form.enabled}
            onChange={(v) => update({ enabled: v })}
          />
          <SwitchRow
            label="允许普通员工使用"
            desc="关闭后仅管理员可使用"
            checked={form.allowNonAdmin}
            onChange={(v) => update({ allowNonAdmin: v })}
          />
          <SwitchRow
            label="默认读取业务数据"
            desc="新对话默认开启「基于系统现有数据回答」"
            checked={form.useDataDefault}
            onChange={(v) => update({ useDataDefault: v })}
          />
        </div>
      </div>

      {/* AI 助手外观（名称 + 图标） */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-4">
        <h3 className="subsection-title">助手外观</h3>
          <p className="text-xs text-muted-foreground">
            自定义右下角悬浮入口的图标与名称，保存后所有用户立即生效。
          </p>

          <SwitchRow
            label="允许自由拖动入口"
            desc="开启后用户可用鼠标把悬浮入口沿右侧上下拖动，位置自动记忆"
            checked={form.assistantDraggable}
            onChange={(v) => update({ assistantDraggable: v })}
          />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            助手名称
          </label>
          <input
            value={form.assistantName}
            onChange={(e) => update({ assistantName: e.target.value })}
            placeholder={DEFAULT_AI_NAME}
            maxLength={20}
            className={inputCls}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            留空则使用默认名称「{DEFAULT_AI_NAME}」。
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            助手图标
          </label>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
              {(() => {
                const Icon = resolveAiIcon(form.assistantIcon || undefined);
                return <Icon className="size-5" />;
              })()}
            </span>
            <div className="flex-1">
              <Select
                value={form.assistantIcon || undefined}
                onValueChange={(v) => update({ assistantIcon: v ?? '' })}
              >
                <SelectTrigger className="w-full text-sm border border-border/80 dark:border-border rounded-lg bg-muted dark:bg-background text-foreground">
                  <SelectValue placeholder="选择图标" />
                </SelectTrigger>
                <SelectContent>
                  {AI_ICON_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            自定义 Logo 图片
          </label>
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-foreground">
              {form.assistantLogo ? (
                <img
                  src={form.assistantLogo}
                  alt="自定义 Logo 预览"
                  className="size-14 object-cover"
                />
              ) : (
                <ImageIcon className="size-6 opacity-50" />
              )}
            </span>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={onLogoFile}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary inline-flex items-center gap-1.5 text-sm"
                >
                  <Upload className="size-4" />
                  {form.assistantLogo ? '更换图片' : '上传图片'}
                </button>
                {form.assistantLogo && (
                  <button
                    type="button"
                    onClick={() => update({ assistantLogo: '' })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="size-4" />
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            上传后优先于上方内置图标，显示在右下角悬浮入口与面板标题。支持 PNG / JPEG / WebP / GIF / SVG，建议不超过 1.5MB。
          </p>
        </div>
      </div>

      {/* 大模型连接 */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-5">
        <h3 className="subsection-title">大模型连接（OpenAI 兼容）</h3>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            API Base URL
          </label>
          <input
            value={form.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            模型名
          </label>
          <div className="flex gap-2">
            {models.length > 0 && !customModel ? (
              <Select
                value={form.model || undefined}
                onValueChange={(v) => {
                  if (v === '__custom__') {
                    setCustomModel(true);
                  } else {
                    update({ model: v ?? '' });
                  }
                }}
              >
                <SelectTrigger className="w-full text-sm border border-border/80 dark:border-border rounded-lg bg-muted dark:bg-background text-foreground">
                  <SelectValue placeholder="从列表中选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">自定义…</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <input
                value={form.model}
                onChange={(e) => update({ model: e.target.value })}
                placeholder="gpt-4o-mini"
                className={inputCls}
              />
            )}
            <button
              type="button"
              onClick={fetchModels}
              disabled={fetching || !form.baseUrl.trim()}
              className="btn-secondary inline-flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`size-4 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? '获取中' : models.length ? '刷新' : '获取模型'}
            </button>
          </div>
          {models.length > 0 && !customModel && (
            <button
              type="button"
              className="text-xs text-primary hover:underline mt-1.5"
              onClick={() => setCustomModel(true)}
            >
              列表中找不到？手动输入模型名
            </button>
          )}
          {customModel && models.length > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline mt-1.5"
              onClick={() => setCustomModel(false)}
            >
              从列表选择
            </button>
          )}
          {modelErr && <p className="text-xs text-destructive mt-1.5">{modelErr}</p>}
          <p className="text-xs text-muted-foreground mt-1.5">
            填写 Base URL 与 API Key 后，点「获取模型」从服务商{' '}
            <code className="text-foreground">/models</code> 端点拉取可用模型。
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            API Key
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder={loaded ? '留空表示不修改现有密钥' : '输入密钥'}
            className={inputCls}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            密钥仅保存在本系统配置中（单租户内部管理工具）。留空则不改动已存密钥。
          </p>
        </div>
      </div>

      {/* 大模型提示 */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-2">
        <h3 className="subsection-title">大模型提示（System Prompt）</h3>
        <p className="text-xs text-muted-foreground">
          自定义发给大模型的系统提示词，用于约束 AI 的角色、语气与回答范围。留空则使用内置默认提示。
        </p>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="例如：你是一名资深 HR 助理，只使用系统内的真实数据回答，语气亲切专业。"
          rows={5}
          className={`${inputCls} resize-y leading-relaxed`}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{form.systemPrompt.trim() ? `已填写 ${form.systemPrompt.trim().length} 字` : '未填写，将使用默认提示'}</span>
          {form.systemPrompt && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => update({ systemPrompt: '' })}
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* 对话历史自动清理 */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-3">
        <h3 className="subsection-title">对话历史自动清理</h3>
        <p className="text-xs text-muted-foreground">
          设置保留天数后，系统每天自动删除超过该天数的 AI 对话记录（全员生效）。设为 0 表示不自动清理。
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={3650}
            value={form.conversationRetentionDays}
            onChange={(e) =>
              update({ conversationRetentionDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
            }
            className={`${inputCls} w-32`}
          />
          <span className="text-sm text-muted-foreground">天（0 = 关闭自动清理）</span>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : '保存配置'}
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          重置
        </button>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
        checked ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-card shadow ring-0 transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 dark:bg-background/40 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
