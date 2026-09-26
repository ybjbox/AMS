/**
 * 出网目标地址的统一校验（批次 5）。
 *
 * 为什么要有这一个模块：AMS 里此前有**三套**各自为政的判断 ——
 *  - `aiRouter.validateOutboundBaseUrl`：按主机名正则挡回环/私网/元数据；
 *  - `wecomDb.validateWeComProxyUrl`：只挡格式（协议/路径/查询），不挡地址；
 *  - `notifyDispatch.sendWebhook` 与 SMTP 主机：**完全不判断**，配什么打什么。
 * 三套口径都不解决同一个根本问题：**判断的是主机名字符串，不是它实际连到的 IP**。
 * `http://evil.example.com` 只要把 A 记录指到 `127.0.0.1` 或 `169.254.169.254`，
 * 正则全部放行，而 AMS 手里正握着管理员配的模型 API Key 与通知内容。
 *
 * 因此这里改成「先解析、再判断」。仍留一个理论窗口（解析后到真正建连之间 DNS 可以变），
 * 彻底堵住需要在 undici 连接器里做 IP 复核；对本系统（内网单实例、配置权在超管）而言，
 * 这一步把"随手填个域名就能打内网"降到需要专门做 DNS rebinding 才行。
 */
import { promises as dns } from "node:dns";
import net from "node:net";

export type OutboundCheck = { ok: true; url: URL; addresses: string[] } | { ok: false; reason: string };

export interface OutboundPolicy {
  /**
   * 是否连 RFC1918 / ULA 私网段一起挡。
   * true = AI 模型地址（默认）：模型 Key 是外部凭据，没有理由打到内网。
   * false = 通知出站通道：内网自建机器人/SMTP 是这台机器的正常用法，
   *        但**回环、云元数据、链路本地、组播一律仍然挡**（那些不是"内网服务"，是宿主自己）。
   */
  blockPrivate?: boolean;
  /**
   * 解析器注入点（默认 dns.resolve4/6）。测试要靠它才能把"域名解析到内网"这件事
   * 判得确定：本机可能挂着 TUN/透明代理，任何域名都解析得出地址（fake-ip），
   * 拿真 DNS 写断言会得到"环境不同结论不同"的假绿/假红。
   */
  resolve?: (host: string) => Promise<string[]>;
}

const METADATA_HOSTS = new Set([
  "metadata",
  "metadata.google.internal",
  "instance-data", // AWS IMDS 主机名别名
  "metadata.goog",
]);

/**
 * 无论策略如何都不允许的目标：打到宿主自己或云元数据，从不可能是"内网服务"。
 * IPv4 首段：127 回环 / 0 unspecified / 169.254 链路本地（含 169.254.169.254）/
 * 100.64/10 CGNAT / ≥224 组播与保留。IPv6：:: 与 ::1 回环、fe80::/10 链路本地、
 * fc00::/7 ULA、ff00::/8 组播。
 *
 * `AMS_ALLOW_LOCAL_OUTBOUND=1` 只给**测试与本机自托管模型**用：
 * 出站集成测试的标准做法就是把 baseUrl 指到本机起的桩服务，生产默认不开。
 * （配置保存路径上 aiRouter 一直就挡回环/私网，所以正常部署不会出现这种地址；
 *   打开这个开关等于承认"我要连本机的模型服务"。）
 */
const ALLOW_LOCAL_OUTBOUND = () => process.env.AMS_ALLOW_LOCAL_OUTBOUND === "1";

function alwaysBlocked(ip: string): boolean {
  if (ALLOW_LOCAL_OUTBOUND()) return false;
  const v = normalizeIp(ip);
  if (net.isIPv4(v)) {
    const [first, second] = v.split(".").map(Number);
    return first === 127 || first === 0 || first === 169 || first >= 224 || (first === 100 && second === 64);
  }
  if (net.isIPv6(v)) {
    const lower = v.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    return /^(fe8|fe9|fea|feb|fc|fd|ff)/.test(lower);
  }
  // 认不出的形态一律拒绝：解析失败不能等于放行
  return true;
}

/**
 * IPv4-mapped IPv6 归一成 IPv4 再判。
 *
 * 两种写法都要管：`::ffff:127.0.0.1` 与 URL 实际会规范化成的十六进制形式
 * `::ffff:7f00:1` —— 只处理点分写法的话，`http://[::ffff:127.0.0.1]/` 这种
 * "长得像 IPv6 的回环地址"就直接穿过去了。
 */
function asMappedIPv4(v6: string): string | null {
  const m = /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(v6);
  if (m) return `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v6);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** 交给判定逻辑的形态：能转成 IPv4 的一律先转 IPv4，避免用 IPv6 写法绕开 IPv4 规则 */
function normalizeIp(ip: string): string {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIPv6(v)) {
    const mapped = asMappedIPv4(v);
    if (mapped) return mapped;
  }
  return v;
}

/** RFC1918（blockPrivate=true 时才生效） */
function privateNetwork(ip: string): boolean {
  const v = normalizeIp(ip);
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    return a === 10 || a === 192 || (a === 172 && b >= 16 && b <= 31);
  }
  if (net.isIPv6(v)) return /^fc|^fd/i.test(v);
  return false;
}

/**
 * 校验一个将由服务端主动去连的地址。
 *
 * 注意调用时机：**必须在每次真正发请求前调用**，不能只在保存配置时调用一次 ——
 * 否则"存的是公网域名、DNS 后来指向内网"（或反之）就绕过了。
 */
export async function assertSafeOutboundUrl(raw: string, policy: OutboundPolicy = {}): Promise<OutboundCheck> {
  const { blockPrivate = true, resolve } = policy;
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, reason: "地址格式无效" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "仅支持 http/https 协议" };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "地址缺少主机名" };
  // 云厂商的元数据域名在各自网络里才解析得动；先按名字挡一道，解析后的 IP 判定再兜一次
  if (METADATA_HOSTS.has(host)) return { ok: false, reason: "不允许访问云元数据地址" };

  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      if (resolve) {
        addresses = await resolve(host);
      } else {
        const [a, aaaa] = await Promise.all([
          dns.resolve4(host).catch(() => [] as string[]),
          dns.resolve6(host).catch(() => [] as string[]),
        ]);
        addresses = [...a, ...aaaa];
      }
    } catch (e) {
      return { ok: false, reason: `域名解析失败：${e instanceof Error ? e.message : String(e)}` };
    }
    if (addresses.length === 0) return { ok: false, reason: "域名没有可用的 A/AAAA 记录" };
  }

  for (const ip of addresses) {
    if (alwaysBlocked(ip)) {
      return { ok: false, reason: `目标地址指向本机或云元数据段（${host} → ${ip}），已拒绝` };
    }
    if (blockPrivate && privateNetwork(ip)) {
      return { ok: false, reason: `不允许访问内网地址（${host} → ${ip}）` };
    }
  }
  return { ok: true, url, addresses };
}

/** 只要结论，不合法就抛错（给"抛错→路由翻 400"的调用点用） */
export async function requireSafeOutboundUrl(raw: string, policy?: OutboundPolicy): Promise<URL> {
  const r = await assertSafeOutboundUrl(raw, policy);
  if (!r.ok) throw new Error(r.reason);
  return r.url;
}
