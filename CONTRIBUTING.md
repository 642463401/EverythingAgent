# 贡献指南

感谢你对 EverythingAgent 的关注！以下内容帮助你快速上手本项目的开发。

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
| 本地搜索 | 原生文件索引（Node.js readdir 后台建索引 + readline 流式查询） |
| 联网搜索 | 秘塔 AI REST API |
| 文档生成 | Python (markdown + xhtml2pdf / python-docx / openpyxl / python-pptx) |
| 命令执行 | child_process.spawn + GBK 解码 |
| MCP | @modelcontextprotocol/sdk (streamable-http + SSE) |
| 打包 | electron-builder → NSIS .exe 安装程序 |

## 项目结构

```
EverythingAgent/
├── electron/                    # Electron 主进程
│   ├── main.ts                  #   窗口管理 / 全局快捷键 / 系统托盘 / IPC
│   ├── preload.ts               #   contextBridge 安全桥接
│   ├── configManager.ts         #   electron-store 配置管理器（模型/设置/对话历史/AI 记忆/技能）
│   └── tools/
│       ├── chatService.ts       #   主 Agent 对话服务（流式 + 委派调度 + 记忆提炼）
│       ├── subAgentService.ts   #   SubAgent 隔离执行服务（最多 15 轮工具调用）
│       ├── everythingSearch.ts  #   原生文件搜索（后台索引 + 实时遍历回退）
│       ├── webSearch.ts         #   秘塔 AI 联网搜索 + 网页阅读
│       ├── fileTools.ts         #   文件读写 / 局部编辑 / 目录浏览 / 数据分析
│       ├── commandRunner.ts     #   命令执行工具（安全沙箱 + GBK 解码）
│       ├── fileManager.ts       #   文件管理 / 应用启动（UAC 处理）/ 桌面控制
│       ├── documentGenerator.ts #   文档生成（PDF/Word/Excel/PPT/Markdown）
│       ├── mcpService.ts        #   MCP 服务管理（第三方工具动态接入）
│       ├── skillService.ts      #   Skills 技能执行引擎
│       ├── cityLookup.ts        #   城市 ID 查询
│       ├── pythonHelper.ts      #   Python 环境检测与路径注入
│       └── adapters/            #   多模型供应商适配器
│           ├── index.ts         #     适配器工厂 getAdapter()
│           ├── openaiAdapter.ts #     OpenAI 兼容（默认）
│           ├── anthropicAdapter.ts #  Anthropic (Claude)
│           ├── googleAdapter.ts #     Google (Gemini)
│           └── types.ts         #     ProviderAdapter 接口定义
├── src/                         # 渲染进程 (React)
│   ├── App.tsx                  #   根组件
│   ├── main.tsx                 #   React 入口
│   ├── index.css                #   TailwindCSS + 主题变量
│   ├── components/
│   │   ├── SpotlightBar.tsx     #   Spotlight 浮动输入栏（搜索/对话/历史入口）
│   │   ├── ChatWindow.tsx       #   AI 对话窗口（Markdown 渲染 + 流式显示）
│   │   ├── SearchResults.tsx    #   文件搜索结果列表
│   │   ├── MarkdownComponents.tsx # Markdown 自定义渲染组件
│   │   ├── ToolStatusIndicator.tsx  # 工具执行状态显示（动画）
│   │   ├── TaskProgressIndicator.tsx # 任务进度可视化
│   │   ├── settings/            #   设置面板
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModelProviderList.tsx  # 模型列表与激活
│   │   │   ├── ModelProviderForm.tsx  # 模型添加/编辑表单
│   │   │   ├── GeneralSettings.tsx    # 通用设置（快捷键/路径/主题）
│   │   │   ├── MemorySettings.tsx     # AI 记忆管理界面
│   │   │   └── SkillsPanel.tsx        # 技能管理（创建/编辑/测试）
│   │   └── ui/                  #   shadcn/ui 基础组件
│   ├── hooks/
│   │   └── useElectron.ts       #   IPC hooks (useModels / useSettings)
│   ├── lib/
│   │   └── utils.ts             #   cn() 工具函数
│   └── types/
│       ├── config.ts            #   TypeScript 类型定义 + IPC 通道常量
│       └── skill.ts             #   Skill + SkillToolItem 类型定义
├── resources/
│   ├── citydata/cities.csv      #   城市信息数据
│   └── python/                  #   内置 Python 环境（构建时自动打包）
├── build/
│   ├── logo.png                 #   应用图标源文件
│   └── icon.ico                 #   转换后的 Windows ICO 图标
├── scripts/
│   ├── convert-icon.js          #   PNG → ICO 图标转换脚本
│   └── setup-python.js          #   Python 环境打包脚本
├── docs/
│   ├── configuration.md         #   配置教程
│   ├── usage.md                 #   使用教程
│   └── mcp-endpoints.md         #   MCP 端点列表
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── electron-builder.yml         #   打包配置 (NSIS)
├── tsconfig.json
└── package.json
```

## 开发环境搭建

### 前置条件

- **Node.js** >= 18
- **Windows** 操作系统
- **Python** >= 3.8（可选，用于生成 Office/PDF 文档）

### 安装依赖

```bash
# 设置 Electron 镜像（中国大陆用户推荐）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

# 安装依赖
npm install --registry=https://registry.npmmirror.com
```

### 开发模式

```bash
npm run dev
```

启动后会自动打开 Electron 窗口，Vite 提供热更新。

## 开发脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发环境 (Vite + Electron HMR) |
| `npm run build` | 完整生产构建 (Python 打包 + 图标转换 + TypeCheck + Build + Pack) |
| `npm run build:vite` | 仅构建前端 + Electron 产物（不打包安装程序） |
| `npm run build:icon` | 将 `build/logo.png` 转换为 `build/icon.ico` |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run setup:python` | 打包 Python 环境到 resources/python/ |

## 生产构建

```bash
# 完整构建：Python 打包 + 图标转换 + 前端 + Electron + .exe 安装包
npm run build
```

构建产物输出到 `release/` 目录：

```
release/EverythingAgent-x.x.x-Setup.exe    # NSIS 安装程序
release/win-unpacked/                       # 免安装版
```

### 应用图标

- 源文件：`build/logo.png`（推荐 512x512 PNG，透明背景）
- `npm run build:icon` 自动转换为多尺寸 ICO
- 完整构建时会自动执行图标转换

## 架构概览

### AgentTeam 委派模型

```
用户消息
  ↓
主 Agent (chatService.ts)
  │  角色：任务调度中心
  │  唯一工具：delegate_task
  │  不直接执行任何操作
  ↓
SubAgent (subAgentService.ts)
  │  角色：隔离执行器
  │  全新上下文，无对话历史
  │  最多 15 轮工具调用
  │  可用工具：search / read / write / edit / command / ...
  ↓
返回结构化结果 { success, summary, filesAffected }
  ↓
主 Agent 汇总结果 → 回复用户
  ↓
自动提炼 AI 记忆
```

**设计理由**：主 Agent 仅做调度，SubAgent 在隔离上下文中执行。这样避免了长对话历史导致的上下文污染——每个子任务都能"认真执行"而不受之前对话的干扰。

### 进程模型

```
主进程 (electron/main.ts)
├── 窗口管理 + 全局快捷键 + 系统托盘
├── configManager — 配置持久化 (electron-store，加密存储 API Key)
└── tools/
    ├── chatService — 主 Agent 对话引擎（流式 + 委派循环 + 上下文压缩）
    ├── subAgentService — SubAgent 隔离执行器
    ├── adapters/ — 多供应商适配器 (OpenAI / Anthropic / Google)
    ├── everythingSearch — 原生文件搜索（后台索引 + 实时遍历回退）
    ├── webSearch — 联网搜索 + 网页阅读
    ├── fileTools — 文件读写 + 局部编辑 + 数据分析
    ├── commandRunner — 命令执行（安全沙箱）
    ├── fileManager — 文件管理 + 应用启动（UAC 处理）
    ├── documentGenerator — 文档生成（Markdown → HTML → PDF）
    ├── mcpService — MCP 第三方工具接入
    ├── skillService — Skills 技能执行引擎
    └── cityLookup — 城市 ID 查询

渲染进程 (src/)
├── SpotlightBar — 浮动输入栏（搜索/对话/历史入口）
├── ChatWindow — AI 对话窗口（Markdown 渲染 + 流式显示）
├── SearchResults — 文件搜索结果列表
├── ToolStatusIndicator — 工具执行状态（动画指示器）
├── TaskProgressIndicator — 任务进度可视化
└── settings/ — 设置面板（模型/通用/记忆/技能）
```

### 多供应商适配器

新增 AI 供应商只需实现 `ProviderAdapter` 接口（`electron/tools/adapters/types.ts`）：

```typescript
interface ProviderAdapter {
  buildUrl(baseUrl: string, modelName: string): string
  buildHeaders(apiKey: string): Record<string, string>
  streamRound(...): Promise<{ content: string; toolCalls: AccumulatedToolCall[] }>
  nonStreamingRequest(...): Promise<string>
}
```

然后在 `adapters/index.ts` 的 `getAdapter()` 中注册。

### 文件搜索架构

本地文件搜索采用**后台索引 + 实时回退**双模式：

1. **后台索引**：应用启动时自动扫描所有磁盘，使用 Node.js `readdir` 递归遍历构建文件路径索引（文本文件），跳过 `node_modules`、`.git`、`$Recycle.Bin` 等目录
2. **索引搜索**：使用 `readline` 流式逐行匹配索引文件，毫秒级返回结果
3. **实时回退**：索引未就绪时，使用 Node.js 递归遍历实时搜索，优先搜索用户目录（Desktop/Documents/Downloads），15 秒超时保护
4. **索引刷新**：索引有效期 2 小时，过期自动重建

### IPC 通信

主进程与渲染进程通过 `contextBridge` (preload.ts) 安全桥接，所有通道定义在 `src/types/config.ts` 的 `IPC_CHANNELS` 中。聊天采用流式 IPC（chunk/end/error 事件），非聊天操作使用 invoke/handle 模式。

### 上下文压缩

为支持长对话和多步任务，`chatService.ts` 实现了自动上下文压缩：

- 历史消息超过阈值时，压缩旧的工具调用结果（保留关键字段，截断大文本）
- 压缩 write_file/edit_file 的参数内容
- 保持最近一轮工具调用完整不压缩
- 注入进度检查消息防止主 Agent 提前停止

## 添加新工具

1. 在 `electron/tools/` 中实现工具函数
2. 在 `chatService.ts` 的 `buildTools()` 中添加工具定义（JSON Schema）
3. 在 `chatService.ts` 的 `executeTool()` 中添加执行分支
4. 更新 `SYSTEM_PROMPT`（主 Agent）和 `SUBAGENT_SYSTEM_PROMPT`（SubAgent）中的工具列表说明
5. 运行 `npm run typecheck` 确保类型正确

## 提交代码

1. 从 `main` 分支创建功能分支
2. 确保 `npm run typecheck` 通过
3. 提交信息使用中文，简洁描述变更内容
4. 创建 Pull Request 并描述改动

### 提交信息规范

```
<动词><变更内容>

示例：
新增文档生成工具
修复文件搜索索引刷新问题
优化SubAgent上下文压缩策略
```
