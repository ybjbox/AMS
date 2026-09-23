---
version: "v4"
updated: "2026-09-23"
supersedes: "v3 (2026-09-19)"
reason: "Design QA 第二轮契约回写：v3 里与实现不符的令牌值按实测更正（侧栏宽度、muted-foreground、暗色卡面、语义色），并裁定三处文档与实现的冲突（动效时长区间、hover 位移禁令、标题字族）；新增焦点环、下拉 value→label、纸张预览、页头构成四条硬规则"
style: "flat-solid-cards"
colors:
  primary-light: "#005BA8"
  primary-dark: "#62A2EA"
  primary-foreground: "#FFFFFF"
  background-light: "#F4F7FA"
  background-dark: "#111826"
  card-light: "#FFFFFF"
  card-dark: "#27272A"
  foreground-light: "#1C222B"
  foreground-dark: "#F3F6F9"
  border-light: "#D9DFE3"
  border-dark: "#FFFFFF / 10%"
  muted-light: "#EFF2F5"
  muted-foreground-light: "#5F6772"
  muted-foreground-dark: "#93A0AE"
  ring-light: "#005BA8"
  ring-dark: "#62A2EA"
  success: "#4AC240"
  warning: "#EDB417"
  destructive: "#DB0003"
  brand-50: "#eaf5ff"
  brand-100: "#d5eaff"
  brand-200: "#b6daff"
  brand-300: "#8cbff9"
  brand-400: "#62a2ea"
  brand-500: "#2371c1"
  brand-600: "#005ba8"
  brand-700: "#024c8d"
  brand-800: "#053d72"
  brand-900: "#08315a"
  brand-950: "#021d3a"
typography:
  page-title:
    fontFamily: "Fira Sans"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    usage: "页面 h1（.page-title）；中文标题下 Fira Code 只影响拉丁/数字，故标题一律 Fira Sans"
  overlay-title:
    fontFamily: "Fira Code"
    fontSize: "16px"
    fontWeight: 500
    usage: "Dialog / Sheet / Popover 标题（font-heading 令牌）"
  body:
    fontFamily: "Fira Sans"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    usage: "正文、表格、表单"
  label:
    fontFamily: "Fira Sans"
    fontSize: "12px"
    fontWeight: 500
    usage: "字段标签"
  secondary-text:
    fontFamily: "Fira Sans"
    fontSize: "12px"
    fontWeight: 400
    usage: "辅助说明、表头、元信息 —— 一律 text-muted-foreground"
  numeric:
    fontFamily: "Fira Code"
    fontSize: "24-30px"
    fontWeight: 700
    usage: "统计卡数值、时间戳、工号（配 tabular-nums）"
  micro:
    fontSize: "11px / 10px"
    fontWeight: 400
    usage: "text-2xs / text-3xs 令牌，禁止 text-[11px]/text-[10px] 任意值"
rounded:
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  2xl: "14.4px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  btn-primary:
    backgroundColor: "#005BA8"
    textColor: "#FFFFFF"
    rounded: "8px"
    padding: "10px 16px"
    height: "36-40px"
  card:
    backgroundColor: "#FFFFFF / #27272A(dark)"
    textColor: "#1C222B / #FAFAFA(dark)"
    rounded: "12-16px"
    padding: "24px"
  input-field:
    backgroundColor: "#FFFFFF / #18181B(dark)"
    textColor: "#18181B / #FFFFFF(dark)"
    rounded: "8px"
    padding: "0 10px"
    height: "36px"
  checkbox:
    backgroundColor: "#005BA8 (checked)"
    textColor: "#FFFFFF"
    rounded: "4px"
    size: "16px"
motion:
  stagger: "40ms"
  micro: "80ms"
  quick: "150ms"
  fast: "250ms"
  medium: "350ms"
  slow: "400ms"
  very-slow: "500ms"
---

# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AMS（行政管理系统）
**Generated:** 2026-09-16 ｜ **v2:** 2026-09-17（品牌主色改定 Logo 蓝 #005BA8）｜ **v3:** 2026-09-19（扁平风格 + 标准节 + 组件边界）｜ **v4:** 2026-09-23（Design QA2 回写：实测值校正 + 三条冲突裁定 + 四条新硬规则）
**Category:** Enterprise Admin Console

---

## Overview

AMS 是单人自用的企业后台（员工/部门/考勤/合同/审批/文档/座位），界面目标：**数据优先、克制的企业蓝、扁平实色表面**。整体气质为精确、密排、可扫描的运营台（dashboard/data/analytics/code mood），而非营销页。

- 一切视觉决策以「同屏信息密度」和「状态可辨」为先；装饰性效果默认不做。
- 主题：亮/暗双主题必须同步验证（暗色为日常使用主态）。
- 视口基准 1370×770（200% 缩放），布局在该宽度下边缘到边缘紧凑。
- **本文档里的每个色值/尺寸都是量出来的**，来源见文末 Verification；改实现要同步改这里，别留两套真相。

## Colors

**唯一品牌锚点：企业蓝 #005BA8（= brand-600）。** CTA、激活态、焦点环、图表主色一律使用 brand 色阶；不得引入 indigo/violet 等第二品牌色相。若确需多色分类（如部门分布图），先在本节增补分类色板再使用。

**品牌色阶（锚点 brand-600 = 精确 Logo 色，oklch 色相 252.6 锚定）：**
`brand-50 #eaf5ff` · `100 #d5eaff` · `200 #b6daff` · `300 #8cbff9`（暗色正文/图标）· `400 #62a2ea`（暗色主强调）· `500 #2371c1` · `600 #005ba8` ★ · `700 #024c8d` · `800 #053d72` · `900 #08315a` · `950 #021d3a`

### 两层真相：表面走 zinc 工具类，文字与焦点走语义令牌

实现里同时存在 shadcn 令牌层与 Tailwind 调色类，**不要混用第三套**。当前分工（按实际用量）：

| 用途 | 真相来源 | 实测值 | 用量 |
|------|----------|--------|------|
| 表面（卡/弹层/侧栏底） | `.card-base` + `bg-white dark:bg-zinc-800` 等 zinc 工具类 | 亮 #FFFFFF / 暗 **#27272A** | bg-zinc-* 525 · bg-white 133 |
| 中性文字与边框 | zinc 工具类 | border-zinc-200/60 · dark zinc-700/white-10 | text-zinc-* 1298 · border-zinc-* 436 |
| **辅助文字** | `text-muted-foreground`（唯一双主题达标档） | 亮 #5F6772 / 暗 #93A0AE | 210 |
| **焦点环 / 主强调** | `--ring` / `--primary` | 亮 #005BA8 / 暗 #62A2EA | 全局 base 规则 |

> ⚠️ `--card` / `--background` / `--border` 这三个 shadcn 遗留令牌的值（暗 card `#171F2E`、page `#111826`、border white/10）**与实际渲染不同步** —— 暗色卡面真实是 zinc-800 `#27272A`。新代码表达表面色请用 zinc 工具类或 `.card-base`，不要用 `bg-card`/`bg-background` 去"对齐"，那会造出第三套暗色底。

### 语义色（只表达状态，不作品牌装饰）

| 语义 | 工具类档位 | 令牌值 | 用例 |
|------|-----------|--------|------|
| success | emerald 家族 | `--success #4AC240` | 在职、审批通过、全勤、在线 |
| warning | amber 家族 | `--warning #EDB417` | 待办角标、待审批、试用期 |
| danger | red / rose 家族 | `--destructive #DB0003` | 离职、驳回、删除、必填星号 |
| info/brand | brand 蓝 | `--primary` | 链接、选中、进行中 |

**文字档位必须成对写（实测结论，见下表）**：

| 档 | 亮色对比度 | 暗色对比度 | 判定 |
|----|-----------|-----------|------|
| `text-zinc-400` | 2.42–2.62 | 5.68–6.81 | 亮色破线 → 只用于图标 |
| `text-zinc-500` | 4.46–4.83 | 3.09–3.18 | 暗色破线 → 别当辅助文字用 |
| `text-muted-foreground` | **5.28–5.72** | **5.59–6.70** | ✅ 辅助文字唯一档 |
| `text-{emerald,amber}-600` | 2.95–3.65 | — | ✗ 状态文字禁用 600 档 |
| `text-{emerald,amber}-700` + `dark:*-400` | 4.64–5.36 | 7.68–8.91 | ✅ 状态文字标准配对 |

> 跨档错配（`text-zinc-400 dark:text-zinc-500`、`text-zinc-500 dark:text-zinc-500`）会让暗色比亮色更暗，是 2026-09-22 那 145 个对比度节点的主因，已被契约测试挡下。

暗色模式对比策略：brand 提亮至 300/400 档作正文与强调；页面底 `#0F172A` 家族，卡面 zinc-800。

## Typography

- **页面与区块标题：Fira Sans。** `.page-title` = `text-24px / 600`（实测 24px/600/Fira Sans），`.section-title` = 18px/600，`.subsection-title` = 14px/600。
- **浮层标题：Fira Code**（`font-heading` 令牌，仅 ui/dialog · sheet · popover 的标题使用）。中文标题下 Fira Code 只影响拉丁与数字，这条差异是刻意保留的层级区分，不要扩散到页面 h1。
- **数字/时间戳/工号：Fira Code + `tabular-nums`**（表格已全局 `font-variant-numeric: tabular-nums`）。
- **辅助文字：`text-muted-foreground`**，禁止再用 `text-zinc-400/500` 表达正文级文字。
- 层级：页面 h1 ≈ 24px semibold；卡片标题 text-sm/15px medium；字段标签 text-xs；辅助说明 `text-2xs`（11px）；密集表格/热力图微字号 `text-3xs`（10px）。微字号为 @theme 令牌，禁止再写 `text-[10px]/text-[11px]` 任意值。
- 中文文案书面化（"个人模型"而非"自己的模型"），功能解释句保持通俗；员工可见文案不用口语与 emoji，也不得出现内部枚举值（见 Components · Select）。

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

## Layout

- **骨架：** 固定侧栏 **192px（w-48）** + 内容区 PageContainer；桌面端无顶栏（用户区并入侧栏 banner）。折叠入口是骑缝圆钮（h-6 w-6，`-right-3 top-[72px]`），banner 固定高 72px。
- **侧栏定宽列：** banner 内层 / 导航块 / 账户区共用 `w-[124px] mx-auto`（实测 124px），行内容在胶囊内居中，角标绝对定位于图标（`-top-1.5 -right-2`）。这些 arbitrary 宽度**是契约的一部分**，不是待清理的魔法数。
- **栅格：** 内容区 12 列语义 —— 主列表 lg:col-span-8/9，侧栏卡 lg:col-span-4/3；卡片间距 gap-6，卡内 gap-3/4。
- **间距节奏：** 用 spacing token（4/8/16/24/32/48/64）；页边到卡片边缘尽量贴边（密排优先）。
- 断点：375 / 768 / 1024 / 1440；移动端侧栏折叠为抽屉（Sheet 同宽 w-48）。
- **页头构成唯一：** `.page-header` + `.page-title` + `.page-subtitle`。禁止在标题左侧加图标胶囊（2026-09-23 已把最后两页收回来）。

## Elevation & Depth

**风格 = 实色扁平（flat solid）。** 卡片与表面不透明，层次靠「边框 + 极轻阴影 + 背景色差」表达，不依赖玻璃拟态/毛玻璃。

| 层级 | 值 | 用例 |
|------|----|------|
| 页面底 | 亮 #F4F7FA / 暗 #111826（body 另带极淡的品牌色 radial 氛围） | 背景 |
| 卡片 | `.card-base` = `bg-white dark:bg-zinc-800 shadow-sm border zinc-200/60 (dark white/10)` | 功能卡、表格容器 |
| 浮层 | `shadow-md` + ring-1 foreground/10 | Select 弹层、Popover、Dropdown |
| 浮层（大） | `shadow-popover` | 用户菜单等自定义浮层 |
| 模态 | `shadow-xl` + 遮罩 `bg-black/50`（遮罩允许 blur） | Dialog/Sheet |
| 冻结列 | `shadow-sticky-left` / `shadow-sticky-right`（:root/.dark 变量切换，暗色自动加重） | 花名册/合同表左右 sticky 列 |
| 暗色内高光 | `dark:shadow-inset-glow` | 暗色卡片/侧栏顶部 1px 内高光边 |

### 动效（v4 裁定：以已注册的 token 表为准）

`src/styles/transitions-tokens.css` 是时长唯一真相，v3 那句「150–300ms 为限」作废：

| token | 值 | 语义 |
|-------|----|------|
| `--duration-stagger` | 40ms | 逐项错峰 |
| `--duration-micro` | 80ms | tooltip 延迟、shake 分段 |
| `--duration-quick` | 150ms | 关闭态：模态/下拉收起、文字替换、tooltip 出现 |
| `--duration-fast` | 250ms | 打开态：下拉/模态展开、页签滑动、卡片抬升 |
| `--duration-medium` | 350ms | 面板关闭、toast 收起 |
| `--duration-slow` | 400ms | 面板打开、骨架内容揭示 |
| `--duration-very-slow` | 500ms | 强调时刻：徽章出现、成功勾选 |

- 开/关非对称是允许的（开 250 / 关 150 一类），别为"统一"把它抹平。
- 缓动统一用 utility `ease-smooth-out`，禁止 `ease-[var(…)]` 任意值写法。
- `prefers-reduced-motion: reduce` 已在 index.css 全局兜底（时长压到 0.01ms），新增动效不需要各自处理。

### hover 反馈（v4 裁定：改写禁令的理由）

v3 写的是「❌ 布局位移型 hover（scale/translate 导致 reflow）」—— 前提不成立：`transform` 走合成层，**不引起 reflow**。真实要防的是"改变布局盒/尺寸"和"无过渡的瞬变"。规则改为：

- ✅ 卡片抬升统一用 `card-base card-lift`（= `transition-[box-shadow,transform] duration-250 hover:shadow-md hover:-translate-y-0.5`，位移 2px 封顶）。**不要内联重复这串**（已有契约测试挡）。
- ✅ 图标可做 ≤1.1 的缩放强调（`group-hover:scale-110`），FAB 可用 `hover:scale-105 active:scale-95`。
- ❌ 改变宽高/内边距/字号的 hover（真会造成 reflow）、无过渡的瞬变。

> v2 的 Glassmorphism（backdrop-blur 半透明卡）已于 2026-09-19 废弃：实现已演进为实色扁平并经多轮验收。仅模态遮罩层保留 backdrop-filter。

## Shapes

- 圆角基准 `--radius: 0.5rem`（8px），派生 sm 4.8 / md 6.4 / **lg 8** / xl 11.2 / 2xl 14.4。
- 控件与输入框 `rounded-lg`(8px)；卡片 `rounded-xl`~`rounded-2xl`；胶囊标签 `rounded-full`；复选框 4px。
- 同一区域内圆角保持一致；图标统一 Lucide 线性 16/20px。

## Components

**优先级：`src/components/ui/*` 原语 > 全局契约类（btn-primary / card-base / page-title 等）> 页内样式。** 新功能不得手搓交互原语；重复 ≥3 次的样式块应下沉为 ui 组件或契约类（P3 迁移即执行此规则）。

**`ui/` 目录本身也要合规**：原语里不得放裸 `<select>` / 手搓浮层 —— 2026-09-22 的 `ui/Pagination` 原生 select 就是扫描盲区（扫描器把 ui/* 整体当原语豁免）。

### Buttons

```css
.btn-primary {
  background: #005BA8; color: #fff;
  padding: 10px 16px; border-radius: 8px;
  font-weight: 500; transition: all 200ms ease; cursor: pointer;
}
.btn-primary:hover { background: brand-700; }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
```

次级按钮：`border zinc-300/600 + text-zinc-700`，hover 浅底。危险操作用 red 语义色并要求 useConfirm 二次确认。

图标按钮一律 `<Button variant="ghost" size="icon-xs|icon-sm">` 且**必须带中文 `aria-label`**（作用对象写全，如「删除文件夹：行政部」）。`size="xs"` 是 h-6/px-2 —— 放进密排表格或面包屑时要补 `h-auto px-0` 才不会把行撑高 4px。

### 焦点环（v4 新增硬规则）

全站由 `src/index.css` @layer base 的一条规则兜底，**不要再手写 focus 样式**：

```css
:is(button, [role="button"], a[href], summary, [tabindex]:not([tabindex="-1"])):focus-visible {
  outline-style: solid; outline-width: 2px; outline-offset: 2px; outline-color: var(--ring);
}
```

- 必须写**长手属性**：文件里更早的 `* { outline-ring/50 }` 会把颜色留在 50% alpha（白底约 2:1，达不到 WCAG 2.4.11 的 3:1），用 `outline:` 简写时它仍胜出。
- `ui/*` 原语自带 `outline-none` + `focus-visible:ring-*`（utilities 层压过 base 层），因此不会双环。
- 验收口径：亮 6.80:1 / 暗 5.53:1（对相邻表面）。

### Form fields（统一契约，全站已落地）

```
高度 36px(h-9) · 圆角 8px · 边框 zinc-300 / dark zinc-600
底色 白 / dark zinc-900 · 字号 text-sm
focus：outline-none + ring-4 ring-brand-600/20 + border-brand-600（dark 用 brand-400）
暗色原生 date/time/number 必加 dark:[color-scheme:dark]
下拉 → ui/Select（base-ui）；复选框 → ui/Checkbox（brand-600 选中+白勾）
必填星号 <span class="text-red-500" aria-hidden>*</span>，标签用 <label> 关联（必须有 htmlFor 或包裹控件）
```

禁用态语义：表单"无变更即禁用保存"是允许的模式，但必须在按钮旁给出可见解释文案（如"修改上方信息后即可保存"），不得只靠低对比度暗示。

### Select：value→label 由原语自动派生

`ui/Select` 的包装层会在 children 描述符上递归收集 `<SelectItem value>` 的纯文本标签并喂给 base-ui 的 `items`，所以 **`<SelectValue />` 直接就是中文标签，调用点不必自己传 `items`、也不必写 `{(v) => String(v)}` 的 children 函数**。

- 背景：base-ui 在没有映射时会让 `Select.Value` 回吐原始 value，于是 `value="ALL"` 的筛选框把内部枚举直接显示给用户（2026-09-22 账号管理三处）。
- 例外：标签不是纯文本（带图标等）的项不登记，那种需要调用点自己传 `items`。
- 注意 `items` 只在弹层挂载后才存在于 DOM —— 收集必须发生在元素描述符层，不是查询 DOM。

### 纸张预览（打印/导出所见即所得）

打印件与导出预览（合同、业务单、花名册、通讯录、座位表、台卡、主题效果预览）**恒为白纸**：内部不得出现任何 `dark:` 变体，表面用 `bg-white`/`bg-zinc-50`，文字钉死深色（`text-zinc-900` 等）。

- 理由：预览要对齐纸面结果；同时给浅色底配 `dark:text-zinc-200` 会直接产出 1.15–1.21:1 的不可读文字（2026-09-22 实测两处）。
- 契约测试 `src/__tests__/design-contract.test.ts` 用 `PAPER_FILES` 白名单豁免这类文件的"浅色表面必须有 dark 变体"规则。

### Cards / Modals

卡片：实色表面（见 Elevation），标题行 icon+text-sm medium，内容 p-6；抬升用 `card-lift`。

模态一律走 `ui/dialog`、`ui/sheet`、`BaseModal` 三选一（Esc、焦点陷阱、遮罩语义由原语负责）。**没有 `role=dialog` 与 Esc 的 `fixed inset-0` 不算完成**。仅当原语的层叠或尺寸确实不满足时（例如必须压在 z-[60] 面板之上）才允许自定义，并要在代码里写明原因。

## Do's and Don'ts

- ✅ 每个改动同时截亮/暗双主题验证（`.design-qa/capture-manual.mjs`）
- ✅ 辅助文字用 `text-muted-foreground`；状态文字 `text-{c}-700 dark:text-{c}-400`
- ✅ 焦点环交给全局 base 规则；卡片抬升用 `card-base card-lift`
- ✅ 状态徽章用语义色（amber/emerald/red），图标色用 brand
- ✅ 交付前 `npx vitest run --project client src/__tests__/design-contract.test.ts` 必须绿
- ❌ 引入 indigo/violet 等第二色相；❌ 用绿色作品牌色（绿=success 专用）
- ❌ 玻璃拟态卡片、渐变文字、装饰性动画
- ❌ 手搓 select/checkbox/dialog 原生替代（走 ui 原语，`ui/` 目录内也算）
- ❌ 改变布局盒/尺寸的 hover、无过渡的瞬变（时长见 motion 表）
- ❌ emoji 当图标；低对比文字（正文 <4.5:1、焦点指示 <3:1）
- ❌ 员工可见文案口语化、含占位文本、或露出内部枚举值
- ❌ 在 `.page-title` 左侧加图标胶囊；❌ 用 `bg-card`/`bg-background` 表达暗色表面

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG / Lucide instead)
- [ ] All icons from consistent icon set (Lucide)
- [ ] Hover states use registered duration tokens + `card-lift`（无内联重复、无布局盒变化）
- [ ] **双主题** text contrast ≥4.5:1（不是只量亮色；disabled 态豁免但需解释文案）
- [ ] Focus indicator ≥3:1 且为品牌环（UA 默认环不算过）
- [ ] `prefers-reduced-motion` respected（全局已兜底，勿在组件里另写）
- [ ] Responsive: 375px, 768px, 1024px, 1440px 零横向溢出
- [ ] 暗色主题同步验证（含原生控件 color-scheme、浅色表面都有 dark 变体）
- [ ] 交互原语走 ui/* 组件，未新增组件库旁路；浮层有 dialog 语义与 Esc
- [ ] 下拉触发器显示中文标签，无内部枚举值
- [ ] No content hidden behind fixed navbars / no horizontal scroll on mobile
- [ ] `design-contract.test.ts` 6 条规则全绿；若新增规则，同步更新本文档

---

## Verification（本文档数值怎么来的）

| 事实 | 取证方式 |
|------|----------|
| 令牌实测值（双主题） | `.design-qa/probe-token-truth.mjs` —— oklch 经 canvas 像素读回 sRGB |
| 对比度档位表 | `.design-qa/probe-status-text.mjs` · `probe-color-expr.mjs` · `probe-2026-09-22-contrast.mjs`（20 视图 × 双主题逐节点） |
| 焦点环 6.80 / 5.53 | `.design-qa/probe-focus-color.mjs`（真键盘走焦后读 outline） |
| 侧栏 192px / 定宽列 124px / h1 24-600 | 同 `probe-token-truth.mjs`（getBoundingClientRect + getComputedStyle） |
| 静态规则 | `src/__tests__/design-contract.test.ts`（6 条，跑在 client project） |
| a11y 全量 | `.design-qa/probe-2026-09-22.mjs`（axe 4.13 注入，21 视图 × 双主题；2026-09-23 全 0） |

> 测量陷阱（别再犯）：`getComputedStyle` 在本项目返回 `oklch(...)` 原样字符串，按 RGB 解析会得到垃圾比率；`@theme inline` 不把 `--color-*` 暴露到 :root，只能量生成的 utility 类。
