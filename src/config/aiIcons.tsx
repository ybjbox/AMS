import {
  Bot,
  Sparkles,
  MessageCircle,
  BotMessageSquare,
  Brain,
  Cpu,
  MessagesSquare,
  Wand2,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** AI 助手默认显示名称（未配置时使用）。 */
export const DEFAULT_AI_NAME = 'AI 助手';

/** 可选图标列表（提交给后端的 key 与其显示名）。 */
export const AI_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: 'bot', label: '机器人' },
  { key: 'sparkles', label: '星光' },
  { key: 'message-circle', label: '对话气泡' },
  { key: 'bot-message-square', label: '消息机器人' },
  { key: 'brain', label: '大脑' },
  { key: 'cpu', label: '芯片' },
  { key: 'messages-square', label: '消息方格' },
  { key: 'wand-2', label: '魔杖' },
  { key: 'help-circle', label: '问号' },
];

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot,
  sparkles: Sparkles,
  'message-circle': MessageCircle,
  'bot-message-square': BotMessageSquare,
  brain: Brain,
  cpu: Cpu,
  'messages-square': MessagesSquare,
  'wand-2': Wand2,
  'help-circle': HelpCircle,
};

/** 根据存储的 key 解析出对应图标组件；无效/空 key 回退到默认 Bot。 */
export function resolveAiIcon(key: string | null | undefined): LucideIcon {
  if (key && ICON_MAP[key]) return ICON_MAP[key];
  return Bot;
}

/** 返回用于显示的助手名称（空则回退默认）。 */
export function resolveAiName(name: string | null | undefined): string {
  return name && name.trim() ? name.trim() : DEFAULT_AI_NAME;
}
