/**
 * 品牌资源（登录页背景 / 系统图标）落盘与登记。
 *
 * 为什么不再走 localStorage base64：整张图会被编成 data URL 塞进 zustand persist，
 * 一张 2MB 背景图 ≈ 2.7MB base64，超配额时 setItem 抛错会连带把主题与导航顺序一起丢掉。
 * 现在图片存在 uploads/branding/ 下，浏览器侧只保存一个版本号。
 *
 * 槽位固定（background / icon），文件名按槽位 + 真实类型扩展名，替换时删旧文件，
 * 所以不需要孤儿清理，也不可能被路径注入（slot 走白名单，路径由服务端拼）。
 */
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from './settingsDb.ts';
import { UPLOADS_DIR } from './documentsDb.ts';

export const BRANDING_DIR = path.join(UPLOADS_DIR, 'branding');
const SETTINGS_KEY = 'branding';

export const BRANDING_SLOTS = ['background', 'icon'] as const;
export type BrandingSlot = (typeof BRANDING_SLOTS)[number];

export const isBrandingSlot = (v: string | undefined): v is BrandingSlot =>
  !!v && (BRANDING_SLOTS as readonly string[]).includes(v);

/** 每槽上限：背景是大图，图标只要小图 */
export const BRANDING_MAX_BYTES: Record<BrandingSlot, number> = {
  background: 5 * 1024 * 1024,
  icon: 1 * 1024 * 1024,
};

interface SlotRecord {
  file: string;
  type: string;
  size: number;
  updatedAt: string;
}
type BrandingMap = Partial<Record<BrandingSlot, SlotRecord | null>>;

function readMap(): BrandingMap {
  return getSetting<BrandingMap>(SETTINGS_KEY) ?? {};
}

/**
 * 只认 PNG / JPEG / GIF / WebP 的真实字节头。
 * 刻意拒绝 SVG：它是 XML，能在同源内联渲染时带 <script>，而这两个端点是免鉴权的。
 */
export function sniffImageType(head: Buffer): { type: string; ext: string } | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return { type: 'image/png', ext: 'png' };
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { type: 'image/jpeg', ext: 'jpg' };
  }
  if (head.length >= 6 && head.subarray(0, 3).toString('latin1') === 'GIF') {
    return { type: 'image/gif', ext: 'gif' };
  }
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { type: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function getBrandingStatus() {
  const map = readMap();
  const pick = (slot: BrandingSlot) => {
    const rec = map[slot];
    if (!rec) return null;
    return { url: `/api/branding/${slot}`, updatedAt: rec.updatedAt, size: rec.size, type: rec.type };
  };
  return { background: pick('background'), icon: pick('icon') };
}

export function getBrandingSlot(slot: BrandingSlot): (SlotRecord & { absPath: string }) | null {
  const rec = readMap()[slot];
  if (!rec) return null;
  const absPath = path.join(BRANDING_DIR, rec.file);
  if (!fs.existsSync(absPath)) return null;
  return { ...rec, absPath };
}

/** 用临时文件 + rename 落定，半截写入不会顶掉正在用的图 */
export function commitBrandingFile(slot: BrandingSlot, tmpPath: string, sniff: { type: string; ext: string }, size: number): SlotRecord {
  fs.mkdirSync(BRANDING_DIR, { recursive: true });
  const file = `${slot}.${sniff.ext}`;
  const target = path.join(BRANDING_DIR, file);
  const map = readMap();
  const prev = map[slot];

  fs.renameSync(tmpPath, target);
  const record: SlotRecord = { file, type: sniff.type, size, updatedAt: new Date().toISOString() };
  setSetting(SETTINGS_KEY, { ...map, [slot]: record });

  // 换类型时旧扩展名的文件留着没人引用，直接清掉
  if (prev && prev.file !== file) {
    try {
      fs.unlinkSync(path.join(BRANDING_DIR, prev.file));
    } catch {
      /* 已被删或从未存在，不影响新图生效 */
    }
  }
  return record;
}

export function clearBrandingSlot(slot: BrandingSlot): boolean {
  const map = readMap();
  const rec = map[slot];
  if (!rec) return false;
  try {
    fs.unlinkSync(path.join(BRANDING_DIR, rec.file));
  } catch {
    /* 文件已不在，登记照删 */
  }
  setSetting(SETTINGS_KEY, { ...map, [slot]: null });
  return true;
}
