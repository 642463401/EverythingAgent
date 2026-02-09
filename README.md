# EverythingAgent

> 一个原生 Windows 桌面 AI 助手，以 Spotlight 风格的浮动输入栏为交互核心，集成多模型 AI 对话、Everything 本地文件极速搜索、联网搜索、文件读写分析与 Auto-Coder 自主编码能力。

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

### Everything 本地搜索

- 内置 `es.exe` 命令行工具，调用 [Everything](https://www.voidtools.com/) 实现毫秒级文件名搜索
- 在输入栏输入 `>` 前缀即可触发搜索（也支持 `find:` / `search:` 前缀）
- 实时搜索（250ms 防抖）+ 键盘上下导航 + 文件类型图标
- `Enter` 打开文件 / `Ctrl+Enter` 在资源管理器中定位
- AI 可自主调用 Everything 搜索用户文件

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
  - 运行 Python/Node.js/Java 等代码
  - 安装依赖（pip install / npm install）
  - Git 操作、编译构建、运行测试
- 安全保护：危险命令拦截、系统目录禁止执行、30 秒超时、输出截断
- 最多 15 轮工具调用迭代，支持复杂任务

### Office 文档生成（带回退机制）

- 优先使用 Python 脚本生成真正的 Office 文档：
  - `.docx` — python-docx
  - `.xlsx` — openpyxl
  - `.pptx` — python-pptx
- 自动检测 Python 环境是否可用
- 回退机制：若 Python 不可用或脚本执行失败，自动生成 `.md` Markdown 格式文档

## AI 工具一览

| 工具 | 说明 |
|------|------|
| `everything_search` | 本地文件/文件夹极速搜索（Everything） |
| `web_search` | 联网搜索实时信息（秘塔 AI） |
| `web_reader` | 读取并提取网页正文内容 |
| `read_file` | 读取本地文件内容（最大 512KB） |
| `write_file` | 创建或写入文本文件 |
| `list_directory` | 列出目录下的文件和文件夹 |
| `analyze_data` | 分析 CSV/TSV/JSON 数据文件 |
| `run_command` | 执行系统命令（Python、npm、git 等） |

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Electron 34 |
| 前端框架 | React 19 + TypeScript 5 |
| 构建工具 | Vite 6 + vite-plugin-electron |
| 样式 | TailwindCSS 3 |
| 动画 | Framer Motion 12 |
| UI 组件 | shadcn/ui (Radix UI) |
| 配置持久化 | electron-store (加密 JSON) |
| 本地搜索 | Everything es.exe (child_process) |
| 联网搜索 | 秘塔 AI REST API |
| 命令执行 | child_process.spawn + GBK 解码 |
| 打包 | electron-builder → NSIS .exe 安装程序 |

## 项目结构

```
EverythingAgent/
├── electron/                    # Electron 主进程
│   ├── main.ts                  #   窗口管理 / 全局快捷键 / 系统托盘 / IPC
│   ├── preload.ts               #   contextBridge 安全桥接
│   ├── configManager.ts         #   electron-store 配置管理器（含对话历史）
│   └── tools/
│       ├── everythingSearch.ts   #   Everything 搜索工具
│       ├── webSearch.ts          #   秘塔 AI 联网搜索 + 网页阅读
│       ├── fileTools.ts          #   文件读写 / 目录浏览 / 数据分析
│       ├── commandRunner.ts      #   命令执行工具（安全沙箱）
│       └── chatService.ts        #   AI 对话服务（流式 + 工具调用编排）
├── src/                         # 渲染进程 (React)
│   ├── App.tsx                  #   根组件
│   ├── main.tsx                 #   React 入口
│   ├── index.css                #   TailwindCSS + 主题变量
│   ├── components/
│   │   ├── SpotlightBar.tsx     #   Spotlight 浮动输入栏
│   │   ├── ChatWindow.tsx       #   AI 对话窗口
│   │   ├── SearchResults.tsx    #   Everything 搜索结果列表
│   │   ├── settings/            #   设置面板
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModelProviderList.tsx
│   │   │   ├── ModelProviderForm.tsx
│   │   │   └── GeneralSettings.tsx
│   │   └── ui/                  #   shadcn/ui 基础组件
│   ├── hooks/
│   │   └── useElectron.ts       #   IPC hooks (useModels / useSettings)
│   ├── lib/
│   │   └── utils.ts             #   cn() 工具函数
│   └── types/
│       └── config.ts            #   TypeScript 类型定义 + IPC 通道
├── resources/
│   └── everything/
│       └── es.exe               #   Everything CLI 工具
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── electron-builder.yml         #   打包配置 (NSIS)
├── tsconfig.json
└── package.json
```

## 快速开始

### 前置条件

- **Node.js** >= 18
- **Windows** 操作系统
- [**Everything**](https://www.voidtools.com/) 已安装并在后台运行（用于本地文件搜索功能）
- **Python** >= 3.8（可选，用于生成 Office 文档；未安装时自动回退为 Markdown）

### 安装依赖

```bash
# 推荐使用国内镜像
npm install --registry=https://registry.npmmirror.com
```

### 开发模式

```bash
npm run dev
```

启动后会自动打开 Electron 窗口，Vite 提供热更新。

### 生产构建

```bash
# 仅构建前端 + Electron 产物
npm run build:vite

# 完整构建：前端 + Electron + .exe 安装包
npm run build
```

构建产物输出到 `release/` 目录，生成文件：

```
release/EverythingAgent-1.0.0-Setup.exe
```

> **注意**：完整构建前需准备 `build/icon.ico`（256x256 应用图标）。首次构建 electron-builder 会下载 Electron 二进制文件，建议设置镜像：
>
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```

## 使用说明

### 基本操作

| 操作 | 说明 |
|------|------|
| `Alt+Space` | 唤起 / 隐藏窗口 |
| 直接输入文字 + `Enter` | 发送 AI 对话指令 |
| `> 关键词` | 搜索本地文件（Everything） |
| `find:关键词` / `search:关键词` | 同上，备选触发方式 |
| `Esc` | 退出搜索 / 收起对话 / 隐藏窗口 |
| 齿轮图标 / 托盘右键「设置」 | 打开设置面板 |

### 搜索结果操作

| 操作 | 说明 |
|------|------|
| `↑` `↓` | 在搜索结果中导航 |
| `Enter` | 用默认程序打开选中文件 |
| `Ctrl+Enter` | 在资源管理器中定位文件 |
| 右键点击条目 | 在资源管理器中定位 |

### 配置 AI 模型

1. 点击设置 → **模型配置** → **添加模型**
2. 选择供应商类型（如 OpenAI 兼容）
3. 填写 **Base URL**（支持自定义中转地址，如 `https://your-oneapi.com/v1`）
4. 填写 **API Key**
5. 填写或选择**模型名称**（如 `deepseek-chat`、`qwen-max`）
6. 保存后点击模型左侧圆圈激活

### 配置联网搜索

1. 打开设置 → **通用设置**
2. 填写**秘塔 AI 搜索 API Key**
3. 保存后 AI 即可联网搜索和阅读网页

## 开发脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发环境 (Vite + Electron) |
| `npm run build` | 完整生产构建 (TypeCheck + Build + Pack) |
| `npm run build:vite` | 仅构建前端 + Electron 产物 |
| `npm run typecheck` | TypeScript 类型检查 |

## 路线图

- [x] Spotlight 风格浮动窗口
- [x] 全局快捷键 + 系统托盘
- [x] 多模型供应商配置管理
- [x] Everything 本地文件搜索（AI 自主调用）
- [x] 流式 AI 对话 + 工具调用
- [x] 联网搜索（秘塔 AI）+ 网页阅读
- [x] 文件读写 + 目录浏览 + 数据分析
- [x] 对话历史持久化
- [x] Auto-Coder 自主编码代理
- [x] 命令执行（run_command）
- [x] Office 文档生成（Python 脚本 + 回退机制）
- [ ] 插件系统
- [ ] 多轮对话上下文管理优化
- [ ] 自定义工具扩展

## 许可证

[MIT](LICENSE)
