import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Webhook, Mail, Send, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchNotifyConfig,
  saveNotifyConfig,
  testNotify,
  CLEAR_SENTINEL,
  type NotifyConfig,
  type WebhookFormat,
} from '@/services/notifyApi';

const WEBHOOK_FORMATS: { value: WebhookFormat; label: string }[] = [
  { value: 'dingtalk', label: '钉钉群机器人' },
  { value: 'wecom', label: '企业微信群机器人' },
  { value: 'feishu', label: '飞书群机器人' },
  { value: 'generic', label: '通用 JSON（{ text }）' },
];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500';

/**
 * 通知出站通道（#15）：站内通知落库后镜像推送到 webhook / 邮件。
 * 邮件按「接收人账号的邮箱」投递，账号无邮箱则静默跳过。
 */
export default function NotifyPanel() {
  const [config, setConfig] = useState<NotifyConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  // 「清除」→「撤销」需要还原点击前的掩码串（不重新拉取，避免丢掉其他未保存编辑）
  const prevMaskedUrl = useRef('');
  const prevMaskedPass = useRef('');

  const load = useCallback(async () => {
    try {
      setConfig(await fetchNotifyConfig());
    } catch {
      toast.error('读取通知通道配置失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!config) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const patchWebhook = (patch: Partial<NotifyConfig['webhook']>) =>
    setConfig((c) => (c ? { ...c, webhook: { ...c.webhook, ...patch } } : c));
  const patchEmail = (patch: Partial<NotifyConfig['email']>) =>
    setConfig((c) => (c ? { ...c, email: { ...c.email, ...patch } } : c));

  const requestClearUrl = () => {
    prevMaskedUrl.current = config.webhook.url;
    patchWebhook({ url: CLEAR_SENTINEL });
  };
  const requestClearPass = () => {
    prevMaskedPass.current = config.email.password;
    patchEmail({ password: CLEAR_SENTINEL });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      setConfig(await saveNotifyConfig(config));
      toast.success('通知通道配置已保存');
    } catch (e) {
      toast.error((e as { error?: string })?.error || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const r = await testNotify();
      if (r.delivered) toast.success('测试消息已发出，请到对应通道查收');
      else
        toast.error(
          `发送结果：webhook ${r.webhook ?? '成功/未启用'}；邮件 ${r.email ?? '成功/未启用'}`
        );
    } catch (e) {
      toast.error((e as { error?: string })?.error || '测试发送失败');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <div>
        <h2 className="subsection-title flex items-center gap-2">
          <Webhook className="size-4 text-muted-foreground" />
          Webhook 群机器人
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          新站内通知将同步推送到群机器人。回调地址含机器人令牌，保存后仅显示掩码；重新填写完整地址才会覆盖，点「清除」可删除已存地址。
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.webhook.enabled}
              onChange={(e) => patchWebhook({ enabled: e.target.checked })}
              className="rounded border-zinc-300 dark:border-zinc-600 text-brand-600 focus:ring-brand-500"
            />
            启用 Webhook 通道
          </label>
          <Field label="平台格式">
            <select
              className={inputCls}
              value={config.webhook.format}
              onChange={(e) => patchWebhook({ format: e.target.value as WebhookFormat })}
            >
              {WEBHOOK_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="回调地址（Webhook URL）"
            hint={
              config.webhook.url === CLEAR_SENTINEL
                ? '已选择清除，保存后生效'
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoComplete="off"
                className={inputCls}
                value={config.webhook.url === CLEAR_SENTINEL ? '' : config.webhook.url}
                placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
                onChange={(e) => patchWebhook({ url: e.target.value })}
              />
              {config.webhook.url === CLEAR_SENTINEL ? (
                <button
                  type="button"
                  onClick={() => patchWebhook({ url: prevMaskedUrl.current })}
                  className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  撤销
                </button>
              ) : config.webhook.url ? (
                <button
                  type="button"
                  onClick={requestClearUrl}
                  className="shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
                >
                  清除
                </button>
              ) : null}
            </div>
          </Field>
        </div>
      </div>

      <div className="border-t border-zinc-100 dark:border-zinc-700 pt-6">
        <h2 className="subsection-title flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          邮件（SMTP）
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          按接收人账号资料中的邮箱投递；接收人未登记邮箱时自动跳过。
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={config.email.enabled}
              onChange={(e) => patchEmail({ enabled: e.target.checked })}
              className="rounded border-zinc-300 dark:border-zinc-600 text-brand-600 focus:ring-brand-500"
            />
            启用邮件通道
          </label>
          <Field label="SMTP 服务器">
            <input
              type="text"
              className={inputCls}
              value={config.email.host}
              placeholder="smtp.example.com"
              onChange={(e) => patchEmail({ host: e.target.value })}
            />
          </Field>
          <Field label="端口">
            <input
              type="number"
              className={inputCls}
              value={config.email.port}
              onChange={(e) => patchEmail({ port: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={config.email.secure}
              onChange={(e) => patchEmail({ secure: e.target.checked })}
              className="rounded border-zinc-300 dark:border-zinc-600 text-brand-600 focus:ring-brand-500"
            />
            使用 SSL/TLS（465 端口通常为 true，587 为 false/STARTTLS）
          </label>
          <Field label="登录账号">
            <input
              type="text"
              className={inputCls}
              value={config.email.user}
              onChange={(e) => patchEmail({ user: e.target.value })}
            />
          </Field>
          <Field
            label="登录密码 / 授权码"
            hint={
              config.email.password === CLEAR_SENTINEL
                ? '已选择清除，保存后生效'
                : '保存后仅显示掩码；留空或保留掩码表示不修改'
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="password"
                autoComplete="new-password"
                className={inputCls}
                value={config.email.password === CLEAR_SENTINEL ? '' : config.email.password}
                onChange={(e) => patchEmail({ password: e.target.value })}
              />
              {config.email.password === CLEAR_SENTINEL ? (
                <button
                  type="button"
                  onClick={() => patchEmail({ password: prevMaskedPass.current })}
                  className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  撤销
                </button>
              ) : config.email.password ? (
                <button
                  type="button"
                  onClick={requestClearPass}
                  className="shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
                >
                  清除
                </button>
              ) : null}
            </div>
          </Field>
          <Field label="发件人地址">
            <input
              type="text"
              className={inputCls}
              value={config.email.from}
              placeholder="ams@example.com"
              onChange={(e) => patchEmail({ from: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="btn-primary">
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? '保存中…' : '保存配置'}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={isTesting}
          className="btn-secondary"
        >
          <Send className="w-4 h-4 mr-2" />
          {isTesting ? '发送中…' : '发送测试消息'}
        </button>
      </div>
    </div>
  );
}
