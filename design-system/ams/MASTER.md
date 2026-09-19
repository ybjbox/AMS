---
version: "v3"
updated: "2026-09-19"
supersedes: "v2 (2026-09-17)"
reason: "Design QA 契约回写：实现已演进为实色扁平卡（用户多轮验收），v2 的 Glassmorphism 段落废弃；补齐审计器要求的标准节与机器可读 token"
style: "flat-solid-cards"
colors:
  primary: "#005BA8"
  primary-foreground: "#FFFFFF"
  secondary: "#334155"
  background-light: "#F4F6F8"
  foreground-light: "#18181B"
  background-dark: "#0F172A"
  foreground-dark: "#F8FAFC"
  card-light: "#FFFFFF"
  card-dark: "#1B2336"
  border-light: "#E4E4E7"
  border-dark: "#475569"
  muted-foreground: "#71717A"
  success: "#22C55E"
  warning: "#F59E0B"
  destructive: "#EF4444"
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
  heading:
    fontFamily: "Fira Code"
    fontWeight: 600
    usage: "页面标题 h1/h2、卡片区块标题"
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
    usage: "字段标签、辅助说明"
  numeric:
    fontFamily: "Fira Code"
    fontSize: "24px"
    fontWeight: 700
    usage: "统计卡数值、时间戳"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
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
    textColor: "#18181B / #FAFAFA(dark)"
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
---

# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AMS（行政管理系统）
**Generated:** 2026-09-16 ｜ **v2:** 2026-09-17（品牌主色改定 Logo 蓝 #005BA8）｜ **v3:** 2026-09-19（Design QA 契约回写：扁平风格 + 标准节 + 组件边界）
**Category:** Enterprise Admin Console

---

## Overview

AMS 是单人自用的企业后台（员工/部门/考勤/合同/审批/文档/座位），界面目标：**数据优先、克制的企业蓝、扁平实色表面**。整体气质为精确、密排、可扫描的运营台（dashboard/data/analytics/code mood），而非营销页。

- 一切视觉决策以「同屏信息密度」和「状态可辨」为先；装饰性效果默认不做。
- 主题：亮/暗双主题必须同步验证（暗色为日常使用主态）。
- 视口基准 1370×770（200% 缩放），布局在该宽度下边缘到边缘紧凑。

## Colors

**唯一品牌锚点：企业蓝 #005BA8（= brand-600）。** CTA、激活态、焦点环、图表主色一律使用 brand 色阶；不得引入 indigo/violet 等第二品牌色相。若确需多色分类（如部门分布图），先在本节增补分类色板再使用。

**品牌色阶（锚点 brand-600 = 精确 Logo 色，oklch 色相 252.6 锚定）：**
`brand-50 #eaf5ff` · `100 #d5eaff` · `200 #b6daff` · `300 #8cbff9`（暗色正文/图标）· `400 #62a2ea`（暗色主强调）· `500 #2371c1` · `600 #005ba8` ★ · `700 #024c8d` · `800 #053d72` · `900 #08315a` · `950 #021d3a`

**语义色（只表达状态，不作品牌装饰）：**

| 语义 | 色 | 用例 |
|------|----|------|
| success | 绿 #22C55E 家族（emerald） | 在职、审批通过、全勤、在线 |
| warning | 琥珀 amber 家族 | 待办角标、待审批、试用期 |
| danger | 红 #EF4444（red） | 离职、驳回、删除、必填星号 |
| info/brand | brand 蓝 | 链接、选中、进行中 |

暗色模式对比策略：brand 提亮至 300/400 档作正文与强调；背景用 #0F172A 深蓝灰家族。

## Typography

- **标题/数字：** Fira Code 600-700（页面标题、统计数值、时间戳）
- **正文/UI：** Fira Sans 400-500（表格、表单、说明文字）
- 层级：页面 h1 ≈ text-xl/2xl semibold；卡片标题 text-sm/15px medium；字段标签 text-xs；辅助说明 `text-2xs`（11px）；密集表格/热力图微字号 `text-3xs`（10px）。微字号为 @theme 令牌，禁止再写 `text-[10px]/text-[11px]` 任意值。
- 中文文案书面化（"个人模型"而非"自己的模型"），功能解释句保持通俗；员工可见文案不用口语与 emoji。

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

## Layout

- **骨架：** 固定侧栏（展开 208px / 折叠骑缝圆钮）+ 内容区 PageContainer；桌面端无顶栏（用户区并入侧栏 banner）。
- **栅格：** 内容区 12 列语义 —— 主列表 lg:col-span-8/9，侧栏卡 lg:col-span-4/3；卡片间距 gap-6，卡内 gap-3/4。
- **间距节奏：** 用 spacing token（4/8/16/24/32/48/64）；页边到卡片边缘尽量贴边（密排优先）。
- 侧栏导航项：图标+文字在胶囊内居中，与分组共用定宽列；角标绝对定位于图标。
- 断点：375 / 768 / 1024 / 1440；移动端侧栏折叠为抽屉。

## Elevation & Depth

**风格 = 实色扁平（flat solid）。** 卡片与表面不透明，层次靠「边框 + 极轻阴影 + 背景色差」表达，不依赖玻璃拟态/毛玻璃。

| 层级 | 值 | 用例 |
|------|----|------|
| 页面底 | 亮 #F4F6F8 / 暗 #0F172A | 背景 |
| 卡片 | `shadow-sm` + `border zinc-200/60 (dark zinc-700/60)` | 功能卡、表格容器 |
| 浮层 | `shadow-md` + ring-1 foreground/10 | Select 弹层、Popover、Dropdown |
| 浮层（大） | `shadow-popover` | 用户菜单等自定义浮层 |
| 模态 | `shadow-xl` + 遮罩 `bg-black/50`（遮罩允许 blur） | Dialog/Sheet |
| 冻结列 | `shadow-sticky-left` / `shadow-sticky-right`（:root/.dark 变量切换，暗色自动加重） | 花名册/合同表左右 sticky 列 |
| 暗色内高光 | `dark:shadow-inset-glow` | 暗色卡片/侧栏顶部 1px 内高光边 |

> 动效缓动统一用 utility `ease-smooth-out`（transitions-tokens.css 已注册进 Tailwind 主题），禁止 `ease-[var(…)]` 任意值写法。

> v2 的 Glassmorphism（backdrop-blur 半透明卡）已于 2026-09-19 废弃：实现已演进为实色扁平并经多轮验收。仅模态遮罩层保留 backdrop-filter。

## Shapes

- 圆角：控件/输入框 `rounded-lg`(8px)；卡片 `rounded-xl`(12px)~`rounded-2xl`(16px)；胶囊标签 `rounded-full`；复选框 `4px`。
- 同一区域内圆角保持一致；图标统一 Lucide 线性 16/20px。

## Components

**优先级：`src/components/ui/*` 原语 > 全局契约类（btn-primary 等）> 页内样式。** 新功能不得手搓交互原语；发现重复 ≥3 次的样式块应下沉为 ui 组件（P3 迁移即执行此规则）。

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

### Form fields（统一契约，审批页已落地，全站推广）

```
高度 36px(h-9) · 圆角 8px · 边框 zinc-300 / dark zinc-600
底色 白 / dark zinc-900 · 字号 text-sm
focus：outline-none + ring-4 ring-brand-600/20 + border-brand-600（dark 用 brand-400）
暗色原生 date/time/number 必加 dark:[color-scheme:dark]
下拉 → ui/Select（base-ui）；复选框 → ui/Checkbox（brand-600 选中+白勾）
必填星号 <span class="text-red-500" aria-hidden>*</span>，标签用 <label> 关联
```

禁用态语义：表单"无变更即禁用保存"是允许的模式，但必须在按钮旁给出可见解释文案（如"修改上方信息后即可保存"），不得只靠低对比度暗示。

### Cards / Modals

卡片：实色表面（见 Elevation），标题行 icon+text-sm medium，内容 p-6。模态用 ui/dialog、ui/sheet 原语，overlay 才允许 blur；最大宽 500px 常规表单、更宽用双栏。

## Do's and Don'ts

- ✅ 每个改动同时截亮/暗双主题验证（`.design-qa/capture-manual.mjs`）
- ✅ 状态徽章用语义色（amber/emerald/red），图标色用 brand
- ✅ 焦点环必须可见（键盘走焦探针 14/14 为基线）
- ❌ 引入 indigo/violet 等第二色相；❌ 用绿色作品牌色（绿=success 专用）
- ❌ 玻璃拟态卡片、渐变文字、装饰性动画
- ❌ 手搓 select/checkbox/dialog 原生替代（走 ui 原语）
- ❌ 布局位移型 hover（scale/translate 导致 reflow）、无过渡的瞬变（150-300ms 为限）
- ❌ emoji 当图标；低对比文字（正文 <4.5:1）
- ❌ 员工可见文案口语化或含占位文本

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG / Lucide instead)
- [ ] All icons from consistent icon set (Lucide)
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum（disabled 态豁免但需解释文案）
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] 暗色主题同步验证（含原生控件 color-scheme）
- [ ] 交互原语走 ui/* 组件，未新增组件库旁路
- [ ] No content hidden behind fixed navbars / no horizontal scroll on mobile
