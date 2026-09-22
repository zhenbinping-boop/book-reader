# 设计基线

本文件是 book-reader 所有界面决策的**唯一事实来源**。改 UI 前先读这里；代码与本文件冲突时，以本文件为准，然后改代码。

最后更新：2026-09-22

---

## 1. 定位

**纸感（E-Ink / Paper）× 理性网格（Swiss Modernism 2.0）**

一句话解释：**阅读区像纸，操作层像仪器。**

- 阅读区（正文、PDF 页）追求"这是一张纸"——低亮度、无装饰、不发光、不打扰。
- 操作层（书架、工具栏、目录抽屉）追求"这是一个仪器"——网格对齐、层级清晰、触控目标明确、反馈即时。

### 三条不可协商原则

| # | 原则 | 具体含义 | 反例（禁止） |
|---|---|---|---|
| 1 | **内容优先，chrome 退让** | 不需要时 UI 完全消失（阅读器工具栏已实现），正文区域零装饰 | 常驻的悬浮按钮、阅读时可见的边框/水印 |
| 2 | **纸不发光** | 大面积底色一律用低亮度暖色，禁止纯白铺底（阅读区） | 阅读区 `background: #fff`、纯黑配纯白 |
| 3 | **位移优于淡入** | 翻页、抽屉用位移表达空间关系；淡入只用于内容就绪 | 章节切换做 crossfade、滚动视差 |

---

## 2. 依据与偏离记录

配色与风格来自 `ui-ux-pro-max` 技能的产品库条目 **Book & Reading Tracker**（`products.csv` / `colors.csv`）：

- 主风格：Swiss Modernism 2.0 + Minimalism & Swiss Style
- 次风格：E-Ink / Paper、Soft UI Evolution
- 配色方向原文：`Warm paper white + ink brown + reading progress green + book cover colors`

### 三处有意偏离（都有理由，不是偷懒）

| 技能建议 | 本项目的做法 | 理由 |
|---|---|---|
| `--border-radius: 0px`（E-Ink 与 Swiss 都这么建议） | 阅读区 0px，UI 层 10–14px | 触屏上全直角按钮辨识度与命中率都差。技能的 0px 是针对桌面排版工具链的建议，未考虑手指输入。**阅读区仍守 0px，因为那是"纸"** |
| `Dark Mode: not-recommended`（E-Ink/Paper 条目明确标注） | 保留暗色，但**不采用"纯黑+纯白"** | 阅读时长是刚需，不能用"不支持暗色"回避。做法是把纸感原则**映射**到暗色：暗底用 `#14161A` 而非 `#000`，正文用 `#B9B5AE` 而非 `#fff`——牺牲一点对比度换掉暗底光晕（halation） |
| 推荐字体 `Cormorant Garamond` / `Fira Sans` 等 webfont | **一个 webfont 都不用**，全部系统字体栈 | ① PWA 要离线可用，webfont 是网络请求；② 承诺过"文件不出本机"，加载第三方 CDN 会打脸；③ 中文字体（思源宋体 10MB+）不可能打包。技能给的 `--font-reading: Georgia` 本身就是系统字体，这条反而印证了做法 |

### 一处技能数据的实际缺陷

技能在 Book & Reading Tracker 里给的 Accent 是 `#D97706`（页黄）。实测它在纸底 `#FFFBEB` 上只有 **3.07:1**，**不能用作正文或小字号文字色**。本项目因此把 accent 拆成两个用途：

- **图形用途**（进度条填充、选中指示、图表）→ 用 `#C98A2E`，不受文字对比度约束
- **文字用途**（链接、强调文本）→ 用 `#8A5A2B`（亮底）/ `#C9A37A`（暗底），均实测 ≥ 4.5:1

---

## 3. 色彩系统

### 3.1 为什么分两层

这是本项目色彩架构的核心决策：

```
┌─ UI 层 ────────────────────────┐  书架、工具栏、抽屉、按钮
│  跟随系统亮/暗，两套           │  accent = 墨棕（Book brown）
└────────────────────────────────┘
┌─ 阅读区层 ─────────────────────┐  正文底、正文色、页码
│  用户显式选择，四套主题        │  与系统亮暗解耦
└────────────────────────────────┘
```

**阅读主题必须与系统亮暗解耦。** 用户系统是暗的、但想在护眼棕褐下读书，是很常见的组合。当前代码用 `prefers-color-scheme` 单方面决定阅读区颜色，是错的——`prefers-color-scheme` 只能作为**首次默认值**，不能作为持续约束。

### 3.2 UI 层

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--ui-bg` | `#F7F5F0` | `#131519` | 页面底 |
| `--ui-surface` | `#FFFDF9` | `#1B1E23` | 卡片、工具栏、抽屉 |
| `--ui-surface-2` | `#F1EEE7` | `#24282E` | 次级面：输入框、未选中按钮 |
| `--ui-text` | `#1F2226` | `#E8E4DC` | 正文 |
| `--ui-text-muted` | `#5C6167` | `#9A9489` | 元信息、页码、说明 |
| `--ui-border` | `#E3DFD6` | `#2E333A` | 分隔线、卡片描边 |
| `--ui-accent` | `#8A5A2B` | `#C9A37A` | 主操作、选中态、链接 |
| `--ui-accent-soft` | `rgba(138,90,43,.10)` | `rgba(201,163,122,.14)` | 选中背景、按下反馈 |
| `--ui-accent-fill` | `#C98A2E` | `#D9903F` | **图形用途**的强调色 |
| `--ui-danger` | `#B91C1C` | `#E0716A` | 删除等破坏性操作 |
| `--ui-overlay` | `rgba(31,34,38,.40)` | `rgba(0,0,0,.55)` | 遮罩 |

**实测对比度**（WCAG，正文目标 4.5:1）

| 组合 | 比值 | 等级 |
|---|---|---|
| `#1F2226` on `#F7F5F0` | 14.66:1 | AAA |
| `#5C6167` on `#F7F5F0` | 5.73:1 | AA |
| `#8A5A2B` on `#FFFDF9` | 5.78:1 | AA |
| `#B91C1C` on `#FFFDF9` | 6.37:1 | AA |
| `#E8E4DC` on `#131519` | 14.41:1 | AAA |
| `#9A9489` on `#131519` | 6.07:1 | AA |
| `#C9A37A` on `#1B1E23` | 7.17:1 | AAA |
| `#E0716A` on `#1B1E23` | 5.36:1 | AA |

> 原先的 `--muted: #6f747b` 在 `#f4f2ee` 上只有 4.1:1，不达标，已替换为 `#5C6167`。

### 3.3 阅读区四套主题

| Token | `paper` 暖纸 | `sepia` 护眼 | `night` 暗纸 | `oled` 纯黑 |
|---|---|---|---|---|
| `--reader-bg` | `#FDFBF7` | `#F4ECD8` | `#14161A` | `#000000` |
| `--reader-surface` | `#EAE6DE` | `#E3D8BE` | `#0E1013` | `#0A0A0A` |
| `--reader-text` | `#1A1A1A` | `#3B3327` | `#B9B5AE` | `#A8A8A8` |
| `--reader-text-muted` | `#6B6B6B` | `#6B6B6B` | `#9A9489` | `#8A857A` |
| `--reader-accent` | `#8A5A2B` | `#8A5A2B` | `#C9A37A` | `#C9A37A` |
| `--reader-rule` | `#E8E3DA` | `#DED2B4` | `#23272D` | `#1A1A1A` |
| 推荐场景 | 日间默认 | 长时间阅读 | 夜间默认 | AMOLED 省电 |

**实测正文对比度**：paper 16.84:1 / sepia 10.56:1 / night 8.87:1 / oled 8.83:1，**四套全部达到 AAA（≥7:1）**。

`--reader-surface` 是给 PDF 用的衬底（页面之间的间隙）。它必须与 `--reader-bg` 有可见差异，否则 PDF 的白色页面会和背景糊成一片，纸感消失。

#### 关键结论：主题相关的语义色不能用单值

`--reader-text-muted` 和 `--reader-accent` **必须随主题切换**，实测数据说明原因：

| 值 | paper 底 | sepia 底 | night 底 |
|---|---|---|---|
| `#9A9489`（暗底用的灰） | **2.91:1 不达标** | **2.56:1 不达标** | 6.01:1 可用 |
| `#6B6B6B`（亮底用的灰） | 5.16:1 可用 | 4.53:1 可用 | 3.40:1 偏弱 |

一个值通吃四套主题是不可能的。**别为了"省 token"把它们合并成一个变量。** 这是接 TXT/EPUB 时最容易踩的坑。

### 3.4 主题选择规则

```css
/* 1. 默认：跟随系统，作为首次默认值 */
.reader { /* light → paper */ }
@media (prefers-color-scheme: dark) { .reader { /* → night */ } }

/* 2. 用户显式选择：data-reader-theme 覆盖，优先级更高 */
.reader[data-reader-theme='sepia'] { ... }
```

用户一旦显式选过，就持续性优先于系统设置，并写入 `db.progress` 持久化。

---

## 4. 字体系统

### 4.1 一个 webfont 都不用

理由见 §2 偏离记录。全部系统字体栈，西文在前、中文在后（浏览器按字符逐个回退，顺序错了会整段回退）。

```css
--font-ui:      system-ui, -apple-system, 'Segoe UI', 'PingFang SC',
                'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
--font-reading-serif: Georgia, 'Times New Roman', 'Songti SC', 'STSong',
                'Source Han Serif SC', 'Noto Serif CJK SC', 'SimSun', serif;
--font-reading-sans:  system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB',
                'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
--font-mono:    ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace;
```

- **UI 一律用 `--font-ui`**（无衬线），包括标题。理由：操作层是仪器，不是书。
- **正文由用户选衬线还是无衬线**（`serif` / `sans`），默认 `serif`——中文长文衬线更耐读。
- **所有数字必须等宽**：页码、百分比、字数用 `font-variant-numeric: tabular-nums`，否则翻页时数字宽度跳动。

### 4.2 字号阶梯

**UI 层**（固定，不随用户偏好变）

| Token | 值 | 用途 |
|---|---|---|
| `--fs-xs` | 11px | 封面角标、徽章 |
| `--fs-sm` | 12px | 页码、元信息、文件大小 |
| `--fs-md` | 13px | 次要按钮、列表项 |
| `--fs-base` | 14px | 卡片标题、抽屉项 |
| `--fs-lg` | 15px | body 基准 |
| `--fs-xl` | 17px | 页面标题 |
| `--fs-2xl` | 22px | 空状态大标题 |

**阅读区**（用户可调，7 档）

`15 / 16 / 18 / 20 / 22 / 24 / 28` px，**默认 18px**（中文手机阅读实测最舒适区间 17–19px）。

配套三个可调滑杆，均持久化：

| 偏好 | 档位 | 默认 |
|---|---|---|
| 字号 `--reader-size` | 15 / 16 / 18 / 20 / 22 / 24 / 28 | 18px |
| 行高 `--reader-leading` | 1.5 / 1.7 / 1.9 | 1.7 |
| 段距 `--reader-para-gap` | 0 / 0.5em / 1em | 0.5em |
| 页边距 `--reader-pad` | 16 / 24 / 40 px | 24px |

> 行高依语言有别：中文最小 1.7（低于此，汉字方块会挤在一起），西文可到 1.5。默认值取中文安全值。

---

## 5. 排版节奏

### 5.1 间距：8px 基准

```css
--sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
--sp-5: 20px;  --sp-6: 24px;  --sp-8: 32px;  --sp-10: 40px;  --sp-12: 48px;
```

来自 Swiss Modernism 2.0 的 `--base-unit: 8px`。4px 是唯一的半档，用于紧凑控件内部。

### 5.2 行宽（measure）—— 最重要的排版参数

技能的两条硬规范：

- 西文每行 **65–75 字符**
- 中文每行 **30–40 字**

实现方式用 `em` 而非 `px`，让它随字号自动缩放：

```css
--reader-measure: 34em;   /* 中文按 1em/字算，约 34 字 */
```

**大屏必须限制宽度。** 正文横跨 1920px 是阅读器最典型的低级错误。桌面端阅读区两侧留白，正文居中，`max-width: var(--reader-measure)`。

### 5.3 中文排版细节

- **段首缩进 2em**（`text-indent: 2em`）——中文书正文的传统，也用于区分段落
- 段间距与首行缩进**二选一**，不要同时用（同时用会出现"缩进 + 空行"的双重分隔，很挤）
- 标点挤压（`text-spacing-trim`）暂不做，浏览器支持不一，等 V1

---

## 6. 圆角与阴影

### 6.1 圆角

```css
--radius-none: 0;      /* 阅读区：PDF 页、正文块 —— 这是纸 */
--radius-xs:   4px;    /* 进度条、徽章 */
--radius-sm:   6px;    /* 小标记、标签 */
--radius-md:  10px;    /* 按钮、输入框 */
--radius-lg:  14px;    /* 卡片、封面 */
--radius-xl:  18px;    /* 抽屉、浮层 */
--radius-full: 999px;  /* 圆形按钮、头像 */
```

**规则：越靠近内容，圆角越小。** 阅读区 0，容器类 14–18，控件类 10。

### 6.2 阴影：只给真正"浮起来"的层级

Swiss 与 E-Ink 都建议"能不用就不用"。落地为：

| Token | 用途 |
|---|---|
| `--shadow-0: none` | **默认**。卡片、工具栏用 `border` 而非阴影区分 |
| `--shadow-1` | 轻微浮起：卡片悬停 |
| `--shadow-2` | 浮层：下拉、弹窗 |
| `--shadow-3` | 抽屉：从侧边滑出，层级最高 |
| `--shadow-page` | **PDF 单页专用**：模拟纸张投影 |

```css
--shadow-1: 0 1px 2px rgba(31,34,38,.06);
--shadow-2: 0 2px 8px rgba(31,34,38,.08), 0 1px 2px rgba(31,34,38,.04);
--shadow-3: 0 8px 32px rgba(31,34,38,.16);
--shadow-page: 0 1px 3px rgba(31,34,38,.14);
```

暗色模式下阴影几乎不可见，**暗色靠 `--ui-border` 和 `surface` 层级差来区分**，不要靠加深阴影。

---

## 7. 动效

```css
--dur-1: 120ms;   /* 按下反馈、hover */
--dur-2: 200ms;   /* 工具栏显隐、抽屉 */
--dur-3: 320ms;   /* 页面/章节切换 */
--ease-out:    cubic-bezier(.2, 0, 0, 1);
--ease-in-out: cubic-bezier(.4, 0, .2, 1);
```

### 规则

1. **位移 > 淡入**。翻页用 `translateX` 表达"翻过去了"；工具栏用 `translateY` 表达"收起来了"。淡入淡出只用于内容就绪（骨架屏 → 真实内容）。
2. **E-Ink 风格要求"无运动模糊、无淡出"**，所以页面切换的位移要**干脆**，不加模糊滤镜。
3. **`prefers-reduced-motion` 下所有时长归零**，包括抽屉与页面切换——但仍保留最终状态（不能因为禁用动效导致抽屉打不开）。

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

4. **禁止**：滚动视差、加载动画超过 800ms、任何自动播放的装饰动效。

---

## 8. 触控与可达性

| 项 | 要求 | 现状 |
|---|---|---|
| 触控目标 | 最小 **44×44 px** | `.btn-icon` 原为 40px，已提升 |
| 点击延迟 | `touch-action: manipulation` | 已有（`-webkit-tap-highlight-color: transparent`） |
| 安全区 | 所有贴边元素用 `env(safe-area-inset-*)` | 已有 |
| 对比度 | 正文 ≥ 4.5:1，目标 7:1 | 已全员达标（见 §3） |
| 焦点可见 | `:focus-visible` 必须有可见指示 | **原先完全缺失，已补** |
| 指针反馈 | 可点元素 `cursor: pointer` | 已有（全局 button） |
| 键盘 | 方向键翻页、Esc 退出 | 待做（V1） |
| 焦点不被遮挡 | `scroll-padding-top` 避开 sticky 栏（WCAG 2.2 AA） | 待做（抽屉打开时需处理） |

### 焦点样式

```css
:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
  border-radius: inherit;
}
```

**`outline` 不要用 `box-shadow` 替代**——`box-shadow` 会被 `overflow: hidden` 裁掉。

---

## 9. 分格式的设计差异

这一节是接 TXT / EPUB 前必须读的。**"纸"的来源不同，主题的作用范围就不同。**

| | PDF | TXT / EPUB（流式） |
|---|---|---|
| 纸来自哪 | **内容自带**——PDF 页面本身是白底 | **主题给的**——文字直接坐在主题底色上 |
| `--reader-bg` 的作用 | 页间衬底（`--reader-surface` 更有用） | 正文背景本身 |
| `--reader-text` 的作用 | 用不到（文字在 canvas 里） | 正文颜色，核心 token |
| 主题切换的效果 | 只改页间间隙和周边 | 改整个正文区 |
| 页边距 | 无效（缩放决定） | 有效 |
| 行高/字号 | 无效（PDF 排版固定） | 有效 |

**推论**：主题切换器对 PDF 只能提供"沉浸包围色"，对 TXT/EPUB 才是真正的"换纸"。UI 上要如实呈现——在 PDF 里不该显示"行高""段距"这类控件的可点击态，应该禁用或隐藏。

---

## 10. 迁移映射

旧变量名保留为**别名**（指向新 token），现有 class 无需改动即可生效：

| 旧变量 | 新 token |
|---|---|
| `--bg` | `var(--ui-bg)` |
| `--surface` | `var(--ui-surface)` |
| `--surface-2` | `var(--ui-surface-2)` |
| `--text` | `var(--ui-text)` |
| `--muted` | `var(--ui-text-muted)` |
| `--border` | `var(--ui-border)` |
| `--accent` | `var(--ui-accent)` |
| `--accent-soft` | `var(--ui-accent-soft)` |
| `--danger` | `var(--ui-danger)` |
| `--reader-bg` | `var(--reader-bg)`（改为主题驱动） |
| `--shadow` | `var(--shadow-1)` |

别名是**过渡措施**。新代码一律直接用新 token；等 TXT/EPUB 接入后统一清理别名层。

### 已修复的不一致

原先主题色在三处不一致，PWA 安装后状态栏会闪色：

| 位置 | 原值 | 现值 |
|---|---|---|
| `index.html` `<meta theme-color>` | `#f6f5f2` | `#F7F5F0` |
| `vite.config.js` manifest `theme_color` | `#f4f2ee` | `#F7F5F0` |
| `vite.config.js` manifest `background_color` | `#f4f2ee` | `#F7F5F0` |
| `styles.css` `--bg` | `#f4f2ee` | `#F7F5F0` |

---

## 11. 待办

按优先级：

- [x] **阅读主题切换** —— 阅读器工具栏的色块按钮，点击循环切换四套主题，偏好存 `localStorage`
- [ ] **完整外观设置面板** —— 目前只能逐次循环切换，看不到四套主题的并排预览；面板同时承载字号 / 行高 / 段距 / 页边距滑杆
- [ ] **工具栏需要重新组织** —— 现有 7 个控件（返回 / 模式 / 缩放三件套 / 主题 / 目录）+ 书名已接近手机一行能容纳的上限。建议把「显示相关」收进一个面板，工具栏只留高频操作
- [ ] **字号 / 行高 / 段距 / 页边距滑杆** —— 均按 §4.2 档位，持久化为全局默认
- [ ] **状态栏颜色跟随阅读主题** —— 需要 JS 动态改 `<meta theme-color>`，当前是静态值
- [ ] **`prefers-reduced-motion` 验证** —— 在真实设备上确认抽屉仍可打开
- [ ] **焦点陷阱** —— 目录抽屉打开时，Tab 不应跑到底层页面（WCAG 2.2 AA 要求焦点不被遮挡）
- [ ] **桌面端行宽限制** —— `--reader-measure` 已在 token 中定义，需在 TXT/EPUB 渲染层实际应用
- [ ] **颜色工具页面** —— 一个只读的 token 展示页，方便校对（可选）
