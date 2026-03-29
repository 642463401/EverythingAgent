# EverythingAgent

> 一个原生 Windows 桌面 AI 助手，以 Spotlight 风格的浮动输入栏为交互核心，集成多模型 AI 对话、本地文件极速搜索、联网搜索、文件读写分析与 Auto-Coder 自主编码能力。

## 演示视频

[![告别手动操作！EverythingAgent一键搞定所有事](https://i0.hdslb.com/bfs/archive/adb028bb6a6723bba890fdf8823a401073b0b4ab.jpg)](https://www.bilibili.com/video/BV1S5f6B3ECb)

▶ 点击上方图片观看完整演示视频

## 功能特性

### Spotlight 式交互

- **全局快捷键** `Alt+Space` 随时唤起，后台驻留系统托盘
- 无边框透明浮动窗口，居中置顶显示
- 输入后自动展开为对话窗口，`Esc` 关闭或收起
- 窗口可拖动，位置自动记忆

### 多模型 AI 对话

- 动态 **ModelProvider** 系统，支持添加/编辑/删除/激活多套模型配置
- 支持的供应商类型：
  - **OpenAI 兼容**（通用）— 适配 DeepSeek、OneAPI、NewAPI 等中转平台
  - **通义千问 DashScope** — 阿里云通义千问系列
  - **阿里云百炼**
  - **Anthropic** — Claude 系列
  - **Google AI** — Gemini 系列
- 用户可自定义 `Base URL`，完整支持代理/中转平台
- API Key 本地加密存储（electron-store）
- 流式输出 + 对话历史管理

### 本地文件搜索

- **无需任何外部依赖**，纯原生实现
- 应用启动时自动在后台构建文件索引（覆盖所有磁盘），索引完成后搜索毫秒级响应
- 索引有效期 2 小时，过期自动重建
- 索引未就绪时自动回退到实时递归搜索（优先搜索用户目录）
- 在输入栏输入 `>` 前缀即可触发搜索（也支持 `find:` / `search:` 前缀）
- 实时搜索（250ms 防抖）+ 键盘上下导航 + 文件类型图标
- `Enter` 打开文件 / `Ctrl+Enter` 在资源管理器中定位
- AI 可自主调用文件搜索工具查找用户文件

### 联网搜索与网页阅读

- 集成**秘塔 AI 搜索** REST API，支持网页、学术、文库等多种搜索范围
- **网页阅读器**：提取任意 URL 的标题和正文内容（Markdown 格式）
- AI 可自主判断何时联网搜索，搜索后再阅读详情页

### 文件读写与数据分析

- **读取文件**：支持文本、代码、配置文件等，自动兼容 UTF-8 / GBK 编码
- **写入文件**：创建任意文本格式文件（.md/.txt/.csv/.json/.py/.js 等）
- **目录浏览**：列出目录下的文件和文件夹信息
- **数据分析**：分析 CSV/TSV/JSON 数据文件，返回列信息、统计摘要（最小/最大/平均/中位数）、唯一值分布和数据预览

### Auto-Coder 自主编码

- AI 可自主完成完整编码工作流：浏览项目 → 读取代码 → 编写/修改代码 → 运行测试 → 修复错误
- **命令执行**：通过 `run_command` 工具在用户电脑上执行系统命令
- 安全保护：危险命令拦截、系统目录禁止执行、30 秒超时、输出截断
- 最多 30 轮工具调用迭代，支持复杂多步任务

### Office 文档生成（带回退机制）

- 优先使用 Python 脚本生成真正的 Office 文档（.docx / .xlsx / .pptx）
- 自动检测 Python 环境是否可用
- 回退机制：若 Python 不可用或脚本执行失败，自动生成 `.md` Markdown 格式文档

### 文件管理与系统操作

- **文件管理**：复制、移动、重命名、删除文件/文件夹（删除到回收站，安全可恢复）
- **打开应用**：通过中英文名称启动已安装应用（如"微信"、"Chrome"、"VSCode"）
- **打开文件**：用默认程序或指定程序打开文件
- **桌面控制**：隐藏/显示桌面图标

### AI 记忆系统

- AI 在每轮对话结束后**自动提炼关键信息**（用户偏好、个人信息、项目上下文等）
- 记忆持久化存储，跨对话自动注入，实现个性化体验
- 智能去重与分类管理，设置面板中可查看、删除、清空

### MCP 扩展服务

- 集成 **Model Context Protocol**，支持动态接入第三方工具
- 预置 MCP 服务（通过 DashScope API 接入）：墨迹天气、12306 火车票、飞常准机票、代码解释器、高德地图等
- 支持 `streamable-http` 和 `sse` 两种传输方式

### 任务规划与进度管理

- 复杂任务自动分解为 3-10 个子任务
- 实时进度跟踪，上下文压缩支持最多 30 轮工具迭代

## AI 工具一览

| 工具 | 说明 |
|------|------|
| `everything_search` | 本地文件/文件夹搜索（原生索引引擎） |
| `web_search` | 联网搜索实时信息（秘塔 AI） |
| `web_reader` | 读取并提取网页正文内容 |
| `read_file` | 读取本地文件内容（支持 PDF，最大 512KB） |
| `write_file` | 创建或写入文本文件 |
| `list_directory` | 列出目录下的文件和文件夹 |
| `analyze_data` | 分析 CSV/TSV/JSON 数据文件 |
| `run_command` | 执行系统命令（Python、npm、git 等） |
| `file_manage` | 文件管理（复制/移动/重命名/删除/创建文件夹） |
| `open_application` | 通过名称打开已安装应用 |
| `open_file` | 用默认或指定程序打开文件 |
| `desktop_control` | 桌面图标显示/隐藏控制 |
| `create_document` | 生成 Office 文档（Word/Excel/PPT/PDF/Markdown） |
| `task_progress` | 任务规划与进度管理 |
| `city_lookup` | 城市 ID 查询（配合天气 MCP 使用） |
| MCP 工具 | 动态扩展工具（天气/火车票/机票/代码解释器等） |

## 快速开始

### 前置条件

- **Node.js** >= 18
- **Windows** 操作系统
- **Python** >= 3.8（可选，用于生成 Office 文档；未安装时自动回退为 Markdown）

### 安装与运行

```bash
# 安装依赖（推荐使用国内镜像）
npm install --registry=https://registry.npmmirror.com

# 启动开发模式
npm run dev

# 完整生产构建（前端 + Electron + .exe 安装包）
npm run build
```

> **注意**：首次构建 electron-builder 会下载 Electron 二进制文件，建议设置镜像：
>
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```

## 使用说明

| 操作 | 说明 |
|------|------|
| `Alt+Space` | 唤起 / 隐藏窗口 |
| 直接输入文字 + `Enter` | 发送 AI 对话指令 |
| `> 关键词` | 搜索本地文件 |
| `↑` `↓` | 在搜索结果中导航 |
| `Enter` | 用默认程序打开选中文件 |
| `Ctrl+Enter` | 在资源管理器中定位文件 |
| `Esc` | 退出搜索 / 收起对话 / 隐藏窗口 |
| 齿轮图标 / 托盘右键「设置」 | 打开设置面板 |

### 配置 AI 模型

1. 点击设置 → **模型配置** → **添加模型**
2. 选择供应商类型（如 OpenAI 兼容）
3. 填写 **Base URL** 和 **API Key**
4. 填写或选择**模型名称**（如 `deepseek-chat`、`qwen-max`）
5. 保存后点击模型左侧圆圈激活

更多详细说明请参阅 [`docs/`](docs/) 目录：

- [配置教程](docs/configuration.md) — 完整的环境搭建与模型配置指南
- [使用教程](docs/usage.md) — 各项功能的详细操作说明
- [MCP 端点列表](docs/mcp-endpoints.md) — 预置 MCP 服务端点与鉴权信息

## 路线图

- [x] Spotlight 风格浮动窗口 + 全局快捷键 + 系统托盘
- [x] 多模型供应商配置管理
- [x] 本地文件搜索（原生索引引擎，AI 自主调用）
- [x] 流式 AI 对话 + 工具调用
- [x] 联网搜索（秘塔 AI）+ 网页阅读
- [x] 文件读写 + 目录浏览 + 数据分析
- [x] 对话历史持久化 + AI 记忆系统
- [x] Auto-Coder 自主编码代理 + 命令执行
- [x] Office 文档生成（Python 脚本 + 回退机制）
- [x] 文件管理 + 应用启动 + 桌面控制
- [x] MCP 扩展服务 + 任务规划与进度管理
- [ ] 插件系统
- [ ] 自定义工具扩展

## 许可证

[GPL-3.0](LICENSE)
# EverythingAgent

> 一个原生 Windows 桌面 AI 助手，以 Spotlight 风格的浮动输入栏为交互核心，集成多模型 AI 对话、本地文件极速搜索、联网搜索、文件读写分析与 Auto-Coder 自主编码能力。

## 演示视频

[![告别手动操作！EverythingAgent一键搞定所有事](https://i0.hdslb.com/bfs/archive/adb028bb6a6723bba890fdf8823a401073b0b4ab.jpg)](https://www.bilibili.com/video/BV1S5f6B3ECb)

▶ 点击上方图片观看完整演示视频

## 功能特性

### Spotlight 式交互

- **全局快捷键** `Alt+Space` 随时唤起，后台驻留系统托盘
- 无边框透明浮动窗口，居中置顶显示
- 输入后自动展开为对话窗口，`Esc` 关闭或收起
- 窗口可拖动，位置自动记忆

### 多模型 AI 对话

- 动态 **ModelProvider** 系统，支持添加/编辑/删除/激活多套模型配置
- 支持的供应商类型：
  - **OpenAI 兼容**（通用）— 适配 DeepSeek、OneAPI、NewAPI 等中转平台
  - **通义千问 DashScope** — 阿里云通义千问系列
  - **阿里云百炼**
  - **Anthropic** — Claude 系列
  - **Google AI** — Gemini 系列
- 用户可自定义 `Base URL`，完整支持代理/中转平台
- API Key 本地加密存储（electron-store）
- 流式输出 + 对话历史管理

### 本地文件搜索

- **无需任何外部依赖**，纯原生实现
- 应用启动时自动在后台构建文件索引（覆盖所有磁盘），索引完成后搜索毫秒级响应
- 索引有效期 2 小时，过期自动重建
- 索引未就绪时自动回退到实时递归搜索（优先搜索用户目录）
- 在输入栏输入 `>` 前缀即可触发搜索（也支持 `find:` / `search:` 前缀）
- 实时搜索（250ms 防抖）+ 键盘上下导航 + 文件类型图标
- `Enter` 打开文件 / `Ctrl+Enter` 在资源管理器中定位
- AI 可自主调用文件搜索工具查找用户文件

### 联网搜索与网页阅读

- 集成**秘塔 AI 搜索** REST API，支持网页、学术、文库等多种搜索范围
- **网页阅读器**：提取任意 URL 的标题和正文内容（Markdown 格式）
- AI 可自主判断何时联网搜索，搜索后再阅读详情页

### 文件读写与数据分析

- **读取文件**：支持文本、代码、配置文件等，自动兼容 UTF-8 / GBK 编码
- **写入文件**：创建任意文本格式文件（.md/.txt/.csv/.json/.py/.js 等）
- **目录浏览**：列出目录下的文件和文件夹信息
- **数据分析**：分析 CSV/TSV/JSON 数据文件，返回列信息、统计摘要（最小/最大/平均/中位数）、唯一值分布和数据预览

### Auto-Coder 自主编码

- AI 可自主完成完整编码工作流：浏览项目 → 读取代码 → 编写/修改代码 → 运行测试 → 修复错误
- **命令执行**：通过 `run_command` 工具在用户电脑上执行系统命令
- 安全保护：危险命令拦截、系统目录禁止执行、30 秒超时、输出截断
- 最多 30 轮工具调用迭代，支持复杂多步任务

### Office 文档生成（带回退机制）

- 优先使用 Python 脚本生成真正的 Office 文档（.docx / .xlsx / .pptx）
- 自动检测 Python 环境是否可用
- 回退机制：若 Python 不可用或脚本执行失败，自动生成 `.md` Markdown 格式文档

### 文件管理与系统操作

- **文件管理**：复制、移动、重命名、删除文件/文件夹（删除到回收站，安全可恢复）
- **打开应用**：通过中英文名称启动已安装应用（如"微信"、"Chrome"、"VSCode"）
- **打开文件**：用默认程序或指定程序打开文件
- **桌面控制**：隐藏/显示桌面图标

### AI 记忆系统

- AI 在每轮对话结束后**自动提炼关键信息**（用户偏好、个人信息、项目上下文等）
- 记忆持久化存储，跨对话自动注入，实现个性化体验
- 智能去重与分类管理，设置面板中可查看、删除、清空

### MCP 扩展服务

- 集成 **Model Context Protocol**，支持动态接入第三方工具
- 预置 MCP 服务（通过 DashScope API 接入）：墨迹天气、12306 火车票、飞常准机票、代码解释器、高德地图等
- 支持 `streamable-http` 和 `sse` 两种传输方式

### 任务规划与进度管理

- 复杂任务自动分解为 3-10 个子任务
- 实时进度跟踪，上下文压缩支持最多 30 轮工具迭代

## AI 工具一览

| 工具 | 说明 |
|------|------|
| `everything_search` | 本地文件/文件夹搜索（原生索引引擎） |
| `web_search` | 联网搜索实时信息（秘塔 AI） |
| `web_reader` | 读取并提取网页正文内容 |
| `read_file` | 读取本地文件内容（支持 PDF，最大 512KB） |
| `write_file` | 创建或写入文本文件 |
| `list_directory` | 列出目录下的文件和文件夹 |
| `analyze_data` | 分析 CSV/TSV/JSON 数据文件 |
| `run_command` | 执行系统命令（Python、npm、git 等） |
| `file_manage` | 文件管理（复制/移动/重命名/删除/创建文件夹） |
| `open_application` | 通过名称打开已安装应用 |
| `open_file` | 用默认或指定程序打开文件 |
| `desktop_control` | 桌面图标显示/隐藏控制 |
| `create_document` | 生成 Office 文档（Word/Excel/PPT/PDF/Markdown） |
| `task_progress` | 任务规划与进度管理 |
| `city_lookup` | 城市 ID 查询（配合天气 MCP 使用） |
| MCP 工具 | 动态扩展工具（天气/火车票/机票/代码解释器等） |

## 快速开始

### 前置条件

- **Node.js** >= 18
- **Windows** 操作系统
- **Python** >= 3.8（可选，用于生成 Office 文档；未安装时自动回退为 Markdown）

### 安装与运行

```bash
# 安装依赖（推荐使用国内镜像）
npm install --registry=https://registry.npmmirror.com

# 启动开发模式
npm run dev

# 完整生产构建（前端 + Electron + .exe 安装包）
npm run build
```

> **注意**：首次构建 electron-builder 会下载 Electron 二进制文件，建议设置镜像：
>
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```

## 使用说明

| 操作 | 说明 |
|------|------|
| `Alt+Space` | 唤起 / 隐藏窗口 |
| 直接输入文字 + `Enter` | 发送 AI 对话指令 |
| `> 关键词` | 搜索本地文件 |
| `↑` `↓` | 在搜索结果中导航 |
| `Enter` | 用默认程序打开选中文件 |
| `Ctrl+Enter` | 在资源管理器中定位文件 |
| `Esc` | 退出搜索 / 收起对话 / 隐藏窗口 |
| 齿轮图标 / 托盘右键「设置」 | 打开设置面板 |

### 配置 AI 模型

1. 点击设置 → **模型配置** → **添加模型**
2. 选择供应商类型（如 OpenAI 兼容）
3. 填写 **Base URL** 和 **API Key**
4. 填写或选择**模型名称**（如 `deepseek-chat`、`qwen-max`）
5. 保存后点击模型左侧圆圈激活

更多详细说明请参阅 [`docs/`](docs/) 目录：

- [配置教程](docs/configuration.md) — 完整的环境搭建与模型配置指南
- [使用教程](docs/usage.md) — 各项功能的详细操作说明
- [MCP 端点列表](docs/mcp-endpoints.md) — 预置 MCP 服务端点与鉴权信息

## 路线图

- [x] Spotlight 风格浮动窗口 + 全局快捷键 + 系统托盘
- [x] 多模型供应商配置管理
- [x] 本地文件搜索（原生索引引擎，AI 自主调用）
- [x] 流式 AI 对话 + 工具调用
- [x] 联网搜索（秘塔 AI）+ 网页阅读
- [x] 文件读写 + 目录浏览 + 数据分析
- [x] 对话历史持久化 + AI 记忆系统
- [x] Auto-Coder 自主编码代理 + 命令执行
- [x] Office 文档生成（Python 脚本 + 回退机制）
- [x] 文件管理 + 应用启动 + 桌面控制
- [x] MCP 扩展服务 + 任务规划与进度管理
- [ ] 插件系统
- [ ] 自定义工具扩展

## 许可证

[GPL-3.0](LICENSE)
