/**
 * 「用户留存条目」数据层：座位方案 / 台卡与座次打印参数 / 未保存草稿这类
 * 由某个账号自己产生、只对自己有意义的小对象。
 *
 * 之前它们全是 React useState —— 刷新即丢，排了一桌的座次要重来。
 * 一张表按 (kind, owner, name) 唯一，payload 存 JSON 文本，读写都限定在 owner 自己，
 * 不提供跨用户读取（管理员也不需要看别人排到一半的名单）。
 */
import { db } from "./db.ts";
import { type DbRow, asString } from "./sqliteUtil.ts";
import { randomUUID } from "node:crypto";

export const SAVED_ITEM_KINDS = [
  "seating-plan",
  "seating-prefs",
  "namecards-prefs",
  "meal-voucher-spec",
] as const;

export type SavedItemKind = (typeof SAVED_ITEM_KINDS)[number];

/** 单个对象上限 256KB：座位方案远小于此，超了就是前端把不该塞的东西进来了 */
export const MAX_PAYLOAD_CHARS = 256 * 1024;

export interface SavedItemRow {
  id: string;
  kind: string;
  name: string;
  owner: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

function ensureSavedItemsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_items_owner_kind_name
       ON saved_items(kind, owner, name)`
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_saved_items_owner ON saved_items(owner)`);
}
ensureSavedItemsTable();

function toRow(row: DbRow): SavedItemRow {
  let payload: unknown;
  try {
    payload = JSON.parse(asString(row.payload));
  } catch {
    // 坏 JSON 不让整张列表 500，按空对象回给前端并保留原行
    payload = null;
  }
  return {
    id: asString(row.id),
    kind: asString(row.kind),
    name: asString(row.name),
    owner: asString(row.owner),
    payload,
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
  };
}

export function isSavedItemKind(v: unknown): v is SavedItemKind {
  return typeof v === "string" && (SAVED_ITEM_KINDS as readonly string[]).includes(v);
}

export function listSavedItems(kind: SavedItemKind | null, owner: string): SavedItemRow[] {
  const rows = kind
    ? db
        .prepare("SELECT * FROM saved_items WHERE owner = ? AND kind = ? ORDER BY updatedAt DESC, name ASC")
        .all(owner, kind)
    : db.prepare("SELECT * FROM saved_items WHERE owner = ? ORDER BY updatedAt DESC").all(owner);
  return (rows as unknown as DbRow[]).map(toRow);
}

export function getSavedItem(id: string, owner: string): SavedItemRow | null {
  const row = db.prepare("SELECT * FROM saved_items WHERE id = ? AND owner = ?").get(id, owner);
  return row ? toRow(row as unknown as DbRow) : null;
}

/** 按 (kind, owner, name) 覆盖写入；返回落库后的行 */
export function upsertSavedItem(input: {
  kind: SavedItemKind;
  name: string;
  owner: string;
  payload: unknown;
}): SavedItemRow {
  const name = input.name.trim();
  if (!name) throw new Error("名称不能为空");
  const text = JSON.stringify(input.payload ?? null);
  if (text.length > MAX_PAYLOAD_CHARS) throw new Error("内容过大，未保存");

  const existing = db
    .prepare("SELECT id FROM saved_items WHERE kind = ? AND owner = ? AND name = ?")
    .get(input.kind, input.owner, name) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE saved_items SET payload = ?, updatedAt = datetime('now','localtime') WHERE id = ?"
    ).run(text, existing.id);
  } else {
    db.prepare(
      "INSERT INTO saved_items (id, kind, name, owner, payload) VALUES (?, ?, ?, ?, ?)"
    ).run(randomUUID(), input.kind, name, input.owner, text);
  }

  const row = db
    .prepare("SELECT * FROM saved_items WHERE kind = ? AND owner = ? AND name = ?")
    .get(input.kind, input.owner, name);
  return toRow(row as unknown as DbRow);
}

/** 返回 true 表示确实删掉了这一行（不存在或不属于该 owner 都返回 false） */
export function deleteSavedItem(id: string, owner: string): boolean {
  return db.prepare("DELETE FROM saved_items WHERE id = ? AND owner = ?").run(id, owner).changes > 0;
}
