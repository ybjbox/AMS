import { useState, useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { Save, Bot, RotateCcw, RefreshCw, Upload, X, ChevronDown, PlugZap, CircleCheck, CircleX } from 'lucide-react';
import { STORAGE_KEYS } from '@/config/constants';
import { getRoleDisplayName } from '@/utils/roleUtils';
import { AI_ICON_OPTIONS, resolveAiIcon, DEFAULT_AI_NAME } from '@/config/aiIcons';
import { Button } from '@/components/ui/button';
import Badge from '@/components/ui/Badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  dailyQuota: number;
  adminDailyQuota: number;
  allowPersonalModel: boolean;
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
  dailyQuota: 20,
  adminDailyQuota: 100,
  allowPersonalModel: true,
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
  // 连接可用性检测
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 今日系统额度用量（含角色档位上限）与个人模型配置名单（超管视角）
  const [usage, setUsage] = useState<
    { username: string; used: number; role?: string; limit?: number }[] | null
  >(null);
  const [personalUsers, setPersonalUsers] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/ai/admin/usage', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.users)) setUsage(j.users);
        if (j && Array.isArray(j.personalModelUsers)) setPersonalUsers(j.personalModelUsers);
      })
      .catch(() => {});
  }, []);

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
            dailyQuota: Number.isFinite(Number(j.dailyQuota)) ? Number(j.dailyQuota) : 20,
            adminDailyQuota: Number.isFinite(Number(j.adminDailyQuota)) ? Number(j.adminDailyQuota) : 100,
            allowPersonalModel: j.allowPersonalModel !== false,
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

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/ai/test', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          model: form.model.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `检测失败（${r.status}）`);
      if (j.ok) {
        setTestResult({
          ok: true,
          text: `连接成功（${j.latencyMs}ms），模型 ${j.model} 回复「${j.reply}」`,
        });
      } else {
        setTestResult({ ok: false, text: j.error || '检测未通过' });
      }
    } catch (e: unknown) {
      setTestResult({ ok: false, text: (e as { message?: string })?.message || '检测失败' });
    } finally {
      setTesting(false);
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
        dailyQuota: Number(form.dailyQuota) || 0,
        adminDailyQuota: Number(form.adminDailyQuota) || 0,
        allowPersonalModel: form.allowPersonalModel,
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
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
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
      <Section title="可用范围">
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
      </Section>

      {/* 额度与个人模型（防滥用） */}
      <Section title="额度与个人模型" className="space-y-5">

        {/* 系统模型额度 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">系统模型额度</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                普通员工每日上限
              </label>
              <Input
                type="number"
                min={0}
                max={100000}
                value={form.dailyQuota}
                onChange={(e) => update({ dailyQuota: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                管理员 / 人事主管每日上限
              </label>
              <Input
                type="number"
                min={0}
                max={100000}
                value={form.adminDailyQuota}
                onChange={(e) => update({ adminDailyQuota: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            超级管理员不受额度限制。填 0 表示该档位不限；额度按自然日计数，次日自动重置。
            走系统额度的调用会强制附加「仅限行政事务范围」的提示词约束；配置了个人模型者不占额度。
          </p>
          {usage && usage.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">今日系统额度用量</div>
              <div className="flex flex-wrap gap-1.5">
                {usage.map((u) => (
                  <Badge
                    key={u.username}
                    variant="neutral"
                    title={
                      u.limit && u.limit > 0
                        ? `${getRoleDisplayName(u.role)} · 每日上限 ${u.limit} 次`
                        : `${getRoleDisplayName(u.role)} · 不限额`
                    }
                  >
                    {u.username}
                    <span className="font-medium tabular-nums">
                      {u.limit && u.limit > 0 ? `${u.used} / ${u.limit} 次` : `${u.used} 次`}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/60" />

        {/* 个人模型 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">个人模型</h3>
          <SwitchRow
            label="允许员工配置个人模型"
            desc="个人模型使用员工自有凭据，不占用系统额度，也不受系统提示词约束"
            checked={form.allowPersonalModel}
            onChange={(v) => update({ allowPersonalModel: v })}
          />
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">已配置个人模型</div>
            {personalUsers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {personalUsers.map((u) => (
                  <span
                    key={u}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                  >
                    {u}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无员工配置（停用后已配置者也将改走系统额度）</p>
            )}
          </div>
        </div>
      </Section>

      {/* AI 助手外观（名称 + 图标） */}
      <Section title="助手外观" defaultOpen={false}>
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
          <Input
            value={form.assistantName}
            onChange={(e) => update({ assistantName: e.target.value })}
            placeholder={DEFAULT_AI_NAME}
            maxLength={20}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            留空则使用默认名称「{DEFAULT_AI_NAME}」。
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            助手图标
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={onLogoFile}
            className="hidden"
          />
          <div className="grid grid-cols-5 gap-2">
            {AI_ICON_OPTIONS.map((o) => {
              const Icon = resolveAiIcon(o.key);
              const selected = !form.assistantLogo && (form.assistantIcon || 'bot') === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  title={o.label}
                  aria-pressed={selected}
                  onClick={() => update({ assistantIcon: o.key, assistantLogo: '' })}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-50/60 text-brand-700 ring-1 ring-brand-500/30 dark:bg-brand-900/20 dark:text-brand-300'
                      : 'border-border/80 text-muted-foreground hover:border-brand-300 hover:text-foreground'
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="text-2xs leading-none">{o.label}</span>
                </button>
              );
            })}
            {/* 第 10 格：上传自定义 Logo（有 Logo 时优先于图标显示，角标 × 移除） */}
            <div className="relative">
              <button
                type="button"
                title="上传自定义 Logo（PNG / JPEG / WebP / GIF / SVG，≤1.5MB）"
                aria-pressed={!!form.assistantLogo}
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors ${
                  form.assistantLogo
                    ? 'border-brand-500 bg-brand-50/60 text-brand-700 ring-1 ring-brand-500/30 dark:bg-brand-900/20 dark:text-brand-300'
                    : 'border-dashed border-border/80 text-muted-foreground hover:border-brand-300 hover:text-foreground'
                }`}
              >
                {form.assistantLogo ? (
                  <img src={form.assistantLogo} alt="自定义 Logo" width={20} height={20} className="size-5 rounded object-cover" />
                ) : (
                  <Upload className="size-5" />
                )}
                <span className="text-2xs leading-none">{form.assistantLogo ? '更换 Logo' : '上传 Logo'}</span>
              </button>
              {form.assistantLogo && (
                <button
                  type="button"
                  aria-label="移除自定义 Logo"
                  title="移除自定义 Logo，恢复上方选中的图标"
                  onClick={() => update({ assistantLogo: '' })}
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-zinc-700 text-white shadow transition-colors hover:bg-red-600 dark:bg-zinc-600"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            所选图标/Logo 用于右下角悬浮入口与面板标题；上传 Logo 后优先于图标，点图标即切回并自动移除 Logo。
          </p>
        </div>
      </Section>

      {/* 大模型连接 */}
      <Section title="大模型连接（OpenAI 兼容）" className="space-y-5">

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            API Base URL
          </label>
          <Input
            value={form.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
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
                <SelectTrigger className="w-full justify-between">
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
              <Input
                value={form.model}
                onChange={(e) => update({ model: e.target.value })}
                placeholder="gpt-4o-mini"
              />
            )}
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={fetchModels}
              disabled={fetching || !form.baseUrl.trim()}
            >
              <RefreshCw className={`size-4 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? '获取中' : models.length ? '刷新' : '获取模型'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={testConnection}
              disabled={testing || !form.baseUrl.trim() || !form.model.trim()}
              title="向服务商发送一次最小对话请求，验证 Base URL、API Key 与模型是否可用"
            >
              <PlugZap className={`size-4 ${testing ? 'animate-pulse' : ''}`} />
              {testing ? '检测中' : '检测'}
            </Button>
          </div>
          {models.length > 0 && !customModel && (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="mt-1.5 h-auto px-0 text-xs text-primary hover:underline"
              onClick={() => setCustomModel(true)}
            >
              列表中找不到？手动输入模型名
            </Button>
          )}
          {customModel && models.length > 0 && (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="mt-1.5 h-auto px-0 text-xs text-primary hover:underline"
              onClick={() => setCustomModel(false)}
            >
              从列表选择
            </Button>
          )}
          {modelErr && <p className="text-xs text-destructive mt-1.5">{modelErr}</p>}
          {testResult && (
            <p
              className={`flex items-start gap-1.5 text-xs mt-1.5 ${
                testResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
              }`}
            >
              {testResult.ok ? (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <CircleX className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{testResult.text}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1.5">
            填写 Base URL 与 API Key 后，点「获取模型」从服务商{' '}
            <code className="text-foreground">/models</code> 端点拉取可用模型；点「检测」发送一次最小对话请求，验证连接与模型是否真正可用。
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            API Key
          </label>
          <Input
            type="password"
            value={form.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder={loaded ? '留空表示不修改现有密钥' : '输入密钥'}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            密钥仅保存在本系统配置中（单租户内部管理工具）。留空则不改动已存密钥。
          </p>
        </div>
      </Section>

      {/* 大模型提示 */}
      <Section
        title="大模型提示（System Prompt）"
        defaultOpen={false}
        className="space-y-2"
        badge={form.systemPrompt.trim() ? `已填写 ${form.systemPrompt.trim().length} 字` : '使用默认提示'}
      >
        <p className="text-xs text-muted-foreground">
          自定义发给大模型的系统提示词，用于约束 AI 的角色、语气与回答范围。留空则使用内置默认提示。
        </p>
        <Textarea
          value={form.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="例如：你是一名资深 HR 助理，只使用系统内的真实数据回答，语气亲切专业。"
          rows={5}
          className="field-sizing-fixed resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{form.systemPrompt.trim() ? `已填写 ${form.systemPrompt.trim().length} 字` : '未填写，将使用默认提示'}</span>
          {form.systemPrompt && (
            <Button
              type="button"
              variant="link"
              size="xs"
              aria-label="清空系统提示词"
              className="h-auto px-0 text-primary hover:underline"
              onClick={() => update({ systemPrompt: '' })}
            >
              清空
            </Button>
          )}
        </div>
      </Section>

      {/* 对话历史自动清理 */}
      <Section title="对话历史自动清理" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          设置保留天数后，系统每天自动删除超过该天数的 AI 对话记录（全员生效）。设为 0 表示不自动清理。
        </p>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={0}
            max={3650}
            value={form.conversationRetentionDays}
            onChange={(e) =>
              update({ conversationRetentionDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
            }
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">天（0 = 关闭自动清理）</span>
        </div>
      </Section>

      {msg && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok'
              ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : '保存配置'}
        </Button>
        <Button type="button" variant="outline" onClick={resetForm}>
          <RotateCcw className="h-4 w-4" />
          重置
        </Button>
      </div>
    </div>
  );
}

/**
 * 可折叠配置分区：低频项（外观 / 提示词 / 清理）默认收起，
 * 折叠用 grid-rows 过渡，展开后仍保留表单状态（组件不卸载）。
 */
function Section({
  title,
  defaultOpen = true,
  className = 'space-y-4',
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  className?: string;
  badge?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <h2 className="subsection-title shrink-0">{title}</h2>
          {badge && !open && (
            <span className="truncate rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-250 ease-smooth-out ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-250 ease-smooth-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className={`px-6 pb-6 ${className}`}>{children}</div>
        </div>
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
        checked ? 'bg-brand-500 dark:bg-brand-500' : 'bg-muted'
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
