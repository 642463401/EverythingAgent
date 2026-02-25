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
| 本地搜索 | Everything 便携版 (自动启停) + es.exe (child_process) |
| 联网搜索 | 秘塔 AI REST API |
| 命令执行 | child_process.spawn + GBK 解码 |
| 打包 | electron-builder → NSIS .exe 安装程序 |

## 项目结构

```
EverythingAgent/
├── electron/                    # Electron 主进程
│   ├── main.ts                  #   窗口管理 / 全局快捷键 / 系统托盘 / IPC
│   ├── preload.ts               #   contextBridge 安全桥接
│   ├── configManager.ts         #   electron-store 配置管理器（含对话历史 + AI 记忆）
│   └── tools/
│       ├── everythingSearch.ts   #   Everything 搜索工具
│       ├── webSearch.ts          #   秘塔 AI 联网搜索 + 网页阅读
│       ├── fileTools.ts          #   文件读写 / 目录浏览 / 数据分析
│       ├── commandRunner.ts      #   命令执行工具（安全沙箱）
│       ├── fileManager.ts        #   文件管理 / 应用启动 / 桌面控制
│       ├── documentGenerator.ts  #   Office 文档生成（Python + 回退）
│       ├── mcpService.ts         #   MCP 服务管理（第三方工具接入）
│       ├── cityLookup.ts         #   城市 ID 查询
│       └── chatService.ts        #   AI 对话服务（流式 + 工具调用 + 记忆提炼）
├── src/                         # 渲染进程 (React)
│   ├── App.tsx                  #   根组件
│   ├── main.tsx                 #   React 入口
│   ├── index.css                #   TailwindCSS + 主题变量
│   ├── components/
│   │   ├── SpotlightBar.tsx     #   Spotlight 浮动输入栏
│   │   ├── ChatWindow.tsx       #   AI 对话窗口
│   │   ├── SearchResults.tsx    #   Everything 搜索结果列表
│   │   ├── ToolStatusIndicator.tsx  # 工具执行状态显示
│   │   ├── TaskProgressIndicator.tsx # 任务进度可视化
│   │   ├── settings/            #   设置面板
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModelProviderList.tsx
│   │   │   ├── ModelProviderForm.tsx
│   │   │   ├── GeneralSettings.tsx
│   │   │   └── MemorySettings.tsx   # AI 记忆管理界面
│   │   └── ui/                  #   shadcn/ui 基础组件
│   ├── hooks/
│   │   └── useElectron.ts       #   IPC hooks (useModels / useSettings)
│   ├── lib/
│   │   └── utils.ts             #   cn() 工具函数
│   └── types/
│       └── config.ts            #   TypeScript 类型定义 + IPC 通道
├── resources/
│   ├── everything/              #   Everything 便携版
│   │   ├── Everything.lng
│   │   └── es.exe               #   Everything CLI 搜索工具
│   └── citydata/
│       └── cities.csv           #   城市信息数据
├── build/
│   ├── logo.png                 #   应用图标源文件
│   ├── icon.ico                 #   转换后的 Windows ICO 图标
│   └── installer.nsh            #   NSIS 自定义安装脚本
├── scripts/
│   └── convert-icon.js          #   PNG → ICO 图标转换脚本
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
- **Python** >= 3.8（可选，用于生成 Office 文档）

### 安装依赖

```bash
# 推荐使用国内镜像
npm install --registry=https://registry.npmmirror.com
```

中国大陆用户建议同时设置 Electron 镜像：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 开发模式

```bash
npm run dev
```

启动后会自动打开 Electron 窗口，Vite 提供热更新。

## 开发脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发环境 (Vite + Electron) |
| `npm run build` | 完整生产构建 (图标转换 + TypeCheck + Build + Pack) |
| `npm run build:vite` | 仅构建前端 + Electron 产物 |
| `npm run build:icon` | 将 `build/logo.png` 转换为 `build/icon.ico` |
| `npm run typecheck` | TypeScript 类型检查 |

## 生产构建

```bash
# 仅构建前端 + Electron 产物
npm run build:vite

# 完整构建：图标转换 + 前端 + Electron + .exe 安装包
npm run build
```

构建产物输出到 `release/` 目录：

```
release/EverythingAgent-1.0.0-Setup.exe
```

### 应用图标

- 源文件：`build/logo.png`（推荐 512x512 PNG，透明背景）
- `npm run build:icon` 自动转换为多尺寸 ICO
- 完整构建时会自动执行图标转换

## 架构概览

### 进程模型

```
主进程 (electron/main.ts)
├── 窗口管理 + 全局快捷键 + 系统托盘
├── configManager — 配置持久化 (electron-store)
└── tools/
    ├── chatService — AI 对话引擎（流式 + 工具调用循环）
    ├── everythingSearch — Everything 本地搜索
    ├── webSearch — 联网搜索 + 网页阅读
    ├── fileTools — 文件读写 + 数据分析
    ├── commandRunner — 命令执行（安全沙箱）
    ├── fileManager — 文件管理 + 应用启动
    ├── documentGenerator — Office 文档生成
    ├── mcpService — MCP 第三方工具接入
    └── cityLookup — 城市 ID 查询

渲染进程 (src/)
├── SpotlightBar — 浮动输入栏（搜索/对话入口）
├── ChatWindow — AI 对话窗口（Markdown 渲染 + 流式显示）
├── SearchResults — 文件搜索结果列表
├── ToolStatusIndicator — 工具执行状态
├── TaskProgressIndicator — 任务进度可视化
└── settings/ — 设置面板（模型配置/通用设置/记忆管理）
```

### IPC 通信

主进程与渲染进程通过 `contextBridge` (preload.ts) 安全桥接，所有通道定义在 `src/types/config.ts` 中。

### AI 工具调用流程

1. 用户发送消息 → `chatService` 构建请求（含工具定义 + 记忆上下文）
2. AI 返回工具调用 → 路由到对应工具执行 → 结果回传
3. 循环迭代（最多 30 轮），直到 AI 返回最终文本回复
4. 对话结束后自动提炼记忆

## 提交代码

1. 从 `main` 分支创建功能分支
2. 确保 `npm run typecheck` 通过
3. 提交信息使用中文，简洁描述变更内容
4. 创建 Pull Request 并描述改动
