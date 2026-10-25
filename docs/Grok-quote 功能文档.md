# X Grok 划词（Grok-quote）v1.0.12 功能文档

> 对象：`Chat-blocker/Grok-quote`（`dist/X Grok Quote.user.js`，2026-08-17 版）
> 用途：作为 Ask X 净室重写的需求基线。本文只描述“它做什么、在什么条件下怎么表现”，不搬运实现代码。
> 末尾附“已知缺口”与对 X 当前 Grok 小窗的实测结论（2026-10-13，Helium）。

---

## 1. 定位

一个 Tampermonkey / Violentmonkey 用户脚本。在 X（x.com / twitter.com）上划选推文文字，点击浮出的引号按钮，把选中内容连同推文链接写进 X 右下角的 **Grok 小窗**（GrokDrawer）输入框，**不自动发送**，由用户补充问题后自己发。

## 2. 运行环境

| 项 | 值 |
| --- | --- |
| 匹配站点 | `x.com`、`www.x.com`、`mobile.x.com`、`m.x.com`，以及对应四个 `twitter.com` 域名，全路径 `/*` |
| 注入时机 | `document-idle`；若 DOM 仍在 loading，则等 `DOMContentLoaded` |
| 权限 | `GM_registerMenuCommand`、`GM_info` |
| 图标 | 内联 SVG 双引号，随系统深浅色切换填充色 |
| 构建 | esbuild 打包成单个 IIFE（target es2020），头部拼接元数据；`verify` 校验元数据格式、无裸 import/export、若干运行时标记字符串存在 |
| 测试 | `node --test` + jsdom，覆盖 chip / grok / quote / source / theme 五个模块 |

## 3. 用户可见功能

### 3.1 划词浮钮（chip）

- **出现条件**（全部满足）：
  1. 页面有非折叠选区，且选区文本经规范化后非空（见 §4.1）；
  2. 选区公共祖先节点仍在文档中；
  3. 选区**不在**以下区域内：浮钮自身、提示条、Grok 小窗、X-blocker 面板（`#x-reply-blocker-ui`、`.xrb-rule-dialog`）、`input` / `textarea` / `select` / `contenteditable="true"`；
  4. 选区矩形有面积。
- **刷新时机**：`mouseup`、`keyup`、`selectionchange` 后在下一个宏任务里刷新（点在浮钮上的事件忽略）。
- **位置**：选区矩形左上角上方 8px；水平、垂直都夹在视口内（四周留 8px）。`position: fixed`，z-index 2147483646。
- **外观**：32×32 透明按钮，仅一个双引号 SVG；无边框、无背景；hover/聚焦时不透明度 0.82。`aria-label="发送划词到 Grok"`。
- **主题**：根据 `html[data-theme]`（light / dark / dim）→ `color-scheme` → 系统 `prefers-color-scheme` 依次判定，浅色主题图标为 `rgb(15,20,25)`，深色为白色。监听 `<html>` 的 `data-theme/style/class` 变化和系统配色变化实时切换。
- **隐藏时机**：选区消失、页面滚动（捕获阶段，任意滚动容器）、窗口缩放。
- **点击后**：
  - `mousedown` 被阻止默认行为，保证点击时不丢选区；
  - 立刻隐藏浮钮、清空页面选区；
  - 2 秒内若同一段文字再次被选中（例如 X 重新渲染导致选区“回弹”），不再弹出浮钮，避免重复。

### 3.2 菜单命令

脚本管理器菜单里注册 **“发送当前划词到 Grok”**，效果与点击浮钮相同（读取当前选区，规则同 §3.1，选区无效时提示“没有可用的划词”）。

### 3.3 写入 Grok 小窗

1. **找小窗**：优先 `#layers [data-testid="GrokDrawer"]`，否则全局找 `[data-testid="GrokDrawer"]`。
2. **找输入框**（依次）：
   - 在小窗内、再在整页内找 `textarea[placeholder="随便问点什么"]`、`textarea[placeholder="Ask anything"]`、任意带 placeholder 的 `textarea`；
   - 小窗内退而求其次找 `[data-testid="grok-input"]`、`textarea`、`contenteditable`、`role=textbox`；
   - 跳过 disabled / aria-disabled / aria-hidden 的元素。
3. **小窗未展开时**：点击“打开器”后每 50ms 轮询，最多 2 秒等待输入框出现。打开器优先级：
   - 小窗存在但没有输入框 → 小窗里的第一个按钮（即标题栏 `GrokDrawerHeader`）；
   - 否则页面上 aria-label 含 “grok” 或 `href="/i/grok"` 的链接/按钮（排除推文内的 “Grok actions” 和小窗内部元素）。
   - 注意：点到侧栏 `/i/grok` 会跳转到 Grok 全页，脚本此时会找不到小窗而报错。
4. **写入方式**：
   - **原生 textarea**（当前 X 实际情况）：用原型上的 `value` setter 写值，再派发 `input`（InputEvent，insertText）和 `change`，让 React 状态同步。写入内容 = 原有内容去掉尾部空白 + 换行 + 引文 + `\n\n` + 一个零宽空格（`​`，用来撑住末尾空行，防止被裁掉）。写完检查一遍，空行丢了就再写一次。光标放到末尾。
   - **contenteditable（Lexical）兜底**：先模拟粘贴（ClipboardEvent + DataTransfer），失败用 `execCommand('insertText')`，再失败派发 beforeinput/input；全部失败且无 execCommand 时直接改 `textContent`。随后单独插入两次 `\n`（Lexical 只把独立的 `\n` 当换行）。
5. **追加而非覆盖**：输入框已有内容时，引文追加在其后，用一个换行分隔。

### 3.4 引文格式

```text
来源：https://x.com/<user>/status/<id>

><选中文字>

```

- 无法确定来源时省略“来源”行，只写 `>文字` 加空行。
- 多行选区只在第一行前加 `>`（后续行不加）。

### 3.5 来源链接解析

- 从选区所在的 `article[data-testid="tweet"]` 中找第一个指向 `/status/` 的链接，**跳过嵌套在引用推文里的链接**（属于另一个 article）。
- 链接规范化为 `https://x.com/<user>/status/<id>`；`/i/status/<id>`、`/i/web/status/<id>` 规范化为 `https://x.com/i/status/<id>`；会去掉 `/photo/1`、`/analytics` 等后缀和查询参数；非 X 域名返回空。
- 选区不在推文里时，回退为当前页面 URL（若当前页是推文详情页）；否则无来源。

### 3.6 提示条（toast）

右下角，2.4 秒后自动消失，同一时间只保留一条：

| 场景 | 文案 | 颜色 |
| --- | --- | --- |
| 写入成功 | 已写入 Grok 小窗。 | 绿 |
| 选区为空/无意义 | 没有可用的划词。 | 红 |
| 找不到输入框 | 未找到 Grok 小窗，请先打开 Grok。 | 红 |
| 写入校验失败 | 无法写入 Grok 输入框。 | 红 |

成功后把焦点放到 Grok 输入框，方便直接接着打字。

## 4. 规则细节

### 4.1 文本规范化

1. `\r\n` / `\r` → `\n`；
2. 去掉行尾空格/制表符；
3. 连续 3 个以上换行压成 2 个；
4. 连续多个空格/制表符压成 1 个；
5. 首尾 trim；
6. 必须至少含一个汉字、字母或数字，否则视为空（例如只选中了 emoji 或标点）；
7. 超过 **2000 字符**截断到 2000。

### 4.2 合并规则

已有内容去掉尾部空白后 + `\n` + 新引文；已有内容为空时直接是新引文。

## 5. 模块结构（现状）

| 文件 | 职责 |
| --- | --- |
| `main.js` | 启动：注入样式、创建浮钮、注册菜单；toast；把结果翻译成提示 |
| `chip.js` | 选区读取、忽略区域判断、浮钮生命周期与定位、主题同步 |
| `grok.js` | 找小窗/输入框/打开器、等待展开、各种写入策略 |
| `quote.js` | 规范化、格式化、合并 |
| `source.js` | 推文链接解析与规范化 |
| `theme.js` | 页面深浅色判定 |
| `styles.js` | 浮钮与 toast 的 CSS |

## 6. 已知缺口（本次需求来源）

1. **总是写进当前对话**：小窗里已有上一次的对话时，新引文会接在旧对话里继续问，而不是开新对话。没有“新对话”选项。
2. **不支持无痕（Private Chat）**：无法选择用 Grok 的 Private Chat 打开。
3. **没有任何设置**：格式、来源行、截断长度、是否自动发送、浮钮行为全写死；没有自定义提问模板（如“解释 / 翻译 / 总结”）。
4. 打开器可能误点侧栏的 `/i/grok` 链接导致整页跳转。
5. 硬编码中文 toast，与 X 界面语言无关。

## 7. X 当前 Grok 小窗实测（2026-10-13，Helium，英文界面）

- 小窗：`#layers [data-testid="GrokDrawer"]`，收起时只有标题栏按钮 `[data-testid="GrokDrawerHeader"]`（aria-label “Grok”），展开后尺寸约 350×483。
- 输入框：原生 `textarea`，placeholder “Ask anything”；发送按钮 aria-label “Grok something”。
- 标题栏右侧按钮（旧版 legacy 头部，当前账号命中）：
  - 空对话时：**Private Chat**、Chat history、Open conversation、Collapse；
  - 有对话时：Private Chat 消失，出现 **New Chat**（X 源码中 New Chat 仅在“可清空对话”时渲染，Private Chat 仅在“不可清空”即空对话时渲染）。
- Private Chat 开启后：按钮图标变为主题色（蓝），空状态下出现 “Private” 标题与 “This chat won’t appear in your history…” 说明；按钮本身没有 `aria-pressed`（新版 xweb 头部才有）。
- 文案都来自 X 的 i18n 表，键名：New Chat=`ica55d24`、Private Chat=`d285710e`、私密说明=`c590ddd2`、发送=`b5df32b0`。
