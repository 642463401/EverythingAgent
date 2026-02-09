# EverythingAgent 项目简介

## 项目概述

**EverythingAgent** 是一款专为 Windows 平台设计的原生桌面 AI 助手应用，采用 Spotlight 风格的浮动输入界面作为核心交互方式。该应用集成了多模型 AI 对话能力和基于 Everything 的本地文件极速搜索功能，旨在为用户提供高效、便捷的智能桌面助手体验。

## 核心特色

### 🎯 Spotlight 式交互体验
- **全局快捷键唤醒**：默认使用 `Alt+Space` 快捷键，随时随地快速调出应用
- **无边框透明窗口**：现代化的视觉设计，窗口居中置顶显示
- **智能窗口行为**：
  - 输入内容后自动展开为完整的对话窗口
  - 支持 `Esc` 键快速关闭或收起窗口
  - 失焦时自动隐藏（可配置）
  - 后台常驻系统托盘，随时待命

### 🤖 多模型 AI 对话系统
- **动态模型配置**：支持添加、编辑、删除和激活多个 AI 模型配置
- **广泛的供应商支持**：
  - **OpenAI 兼容**：支持 DeepSeek、OneAPI、NewAPI 等中转平台
  - **通义千问 DashScope**：阿里云通义千问系列模型
  - **阿里云百炼**：阿里云百炼平台
  - **Anthropic**：Claude 系列模型
  - **Google AI**：Gemini 系列模型
- **安全配置管理**：
  - API Key 本地加密存储
  - 支持自定义 Base URL 和代理配置
  - 完整的模型参数配置选项

### 🔍 Everything 本地文件搜索
- **毫秒级搜索性能**：集成 Everything es.exe 命令行工具
- **多种触发方式**：
  - `> 关键词`（推荐）
  - `find:关键词`
  - `search:关键词`
- **实时搜索体验**：
  - 250ms 防抖优化
  - 键盘上下导航选择
  - 文件类型图标识别
- **便捷操作**：
  - `Enter`：用默认程序打开文件
  - `Ctrl+Enter`：在资源管理器中定位文件
  - 右键菜单支持更多操作

## 技术架构

### 技术栈组成

| 层面 | 技术选型 |
|------|----------|
| **运行环境** | Electron 34 |
| **前端框架** | React 19 + TypeScript 5 |
| **构建工具** | Vite 6 + vite-plugin-electron |
| **样式系统** | TailwindCSS 3 |
| **动画效果** | Framer Motion 12 |
| **UI 组件库** | shadcn/ui (基于 Radix UI) |
| **数据持久化** | electron-store (加密 JSON 存储) |
| **本地搜索** | Everything es.exe (子进程调用) |
| **应用打包** | electron-builder → NSIS .exe 安装程序 |

### 项目结构

```
EverythingAgent/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 窗口管理 / 全局快捷键 / 系统托盘 / IPC通信
│   ├── preload.ts               # contextBridge 安全桥接
│   ├── configManager.ts         # electron-store 配置管理器
│   └── tools/
│       ├── everythingSearch.ts  # Everything 搜索工具封装
│       ├── chatService.ts       # AI 对话服务
│       ├── fileTools.ts         # 文件操作工具
│       └── webSearch.ts         # 网络搜索工具
├── src/                         # 渲染进程 (React)
│   ├── App.tsx                  # 根组件
│   ├── main.tsx                 # React 入口
│   ├── index.css                # TailwindCSS + 主题变量
│   ├── components/
│   │   ├── SpotlightBar.tsx     # Spotlight 浮动输入栏
│   │   ├── ChatWindow.tsx       # AI 对话窗口
│   │   ├── SearchResults.tsx    # Everything 搜索结果列表
│   │   ├── settings/            # 设置面板
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModelProviderList.tsx
│   │   │   ├── ModelProviderForm.tsx
│   │   │   └── GeneralSettings.tsx
│   │   └── ui/                  # shadcn/ui 基础组件
│   ├── hooks/
│   │   └── useElectron.ts       # IPC hooks (useModels / useSettings)
│   ├── lib/
│   │   └── utils.ts             # cn() 工具函数
│   └── types/
│       └── config.ts            # TypeScript 类型定义 + IPC 通道
├── resources/
│   └── everything/
│       └── es.exe               # Everything CLI 工具
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── electron-builder.yml         # 打包配置 (NSIS)
├── tsconfig.json
└── package.json
```

## 核心功能模块

### 1. 窗口管理系统
- **智能尺寸调整**：紧凑模式 (84px) ↔ 展开模式 (520px)
- **位置记忆**：自动保存和恢复窗口位置
- **多显示器支持**：根据光标位置智能定位窗口
- **拖拽支持**：内置拖拽区域，支持窗口移动

### 2. 配置管理
- **双层配置结构**：模型配置 + 通用设置
- **实时同步**：主进程与渲染进程间配置同步
- **加密存储**：敏感信息（API Key）加密保存
- **热重载**：配置变更即时生效

### 3. 搜索引擎集成
- **GBK 编码兼容**：完美处理中文文件名
- **异步搜索**：非阻塞式搜索体验
- **结果缓存**：优化重复查询性能
- **错误处理**：完善的异常捕获和用户提示

### 4. AI 对话引擎
- **流式响应**：实时显示 AI 回复内容
- **会话管理**：支持多轮对话历史保存
- **请求中断**：支持取消正在进行的请求
- **错误恢复**：网络异常时的优雅降级

## 开发环境搭建

### 环境要求
- **Node.js** >= 18
- **Windows** 操作系统
- **Everything** 应用已安装并后台运行

### 快速开始
```bash
# 1. 安装依赖（推荐使用国内镜像）
npm install --registry=https://registry.npmmirror.com

# 2. 启动开发模式
npm run dev

# 3. 生产构建
npm run build
```

## 使用指南

### 基本操作
| 快捷键 | 功能描述 |
|--------|----------|
| `Alt+Space` | 唤起/隐藏窗口 |
| 直接输入 + `Enter` | 发送 AI 对话指令 |
| `> 关键词` | 搜索本地文件 |
| `find:关键词` | 搜索本地文件（备选） |
| `search:关键词` | 搜索本地文件（备选） |
| `Esc` | 退出搜索/收起对话/隐藏窗口 |

### 搜索操作
| 快捷键 | 功能描述 |
|--------|----------|
| `↑` `↓` | 在搜索结果中导航 |
| `Enter` | 用默认程序打开文件 |
| `Ctrl+Enter` | 在资源管理器中定位文件 |
| 右键点击 | 在资源管理器中定位 |

### AI 模型配置流程
1. 点击设置 → 模型配置 → 添加模型
2. 选择供应商类型（如 OpenAI 兼容）
3. 填写 Base URL（支持自定义中转地址）
4. 填写 API Key
5. 选择或填写模型名称
6. 保存并激活模型

## 项目优势

### 🚀 性能优势
- **原生应用**：基于 Electron，充分利用系统资源
- **极速搜索**：Everything 引擎提供毫秒级文件检索
- **低内存占用**：优化的窗口管理和资源释放机制

### 🔧 易用性优势
- **零学习成本**：类似 macOS Spotlight 的交互方式
- **高度可配置**：丰富的个性化设置选项
- **跨平台兼容**：专门针对 Windows 系统优化

### 🛡️ 安全性优势
- **本地存储**：所有敏感配置本地加密保存
- **沙箱隔离**：Electron 安全沙箱机制保护
- **权限控制**：最小化系统权限需求

## 发展路线图

### ✅ 已完成
- [x] Spotlight 风格浮动窗口
- [x] 全局快捷键 + 系统托盘
- [x] 多模型供应商配置管理
- [x] Everything 本地文件搜索

### 🚧 开发中
- [ ] 接入真实 AI API 对话
- [ ] Auto-Coder 自动编码代理工作流
- [ ] Web Search 网络搜索集成

### 🔮 规划中
- [ ] 对话历史持久化
- [ ] 插件系统
- [ ] 更丰富的 AI 模型集成
- [ ] 自定义快捷命令系统

## 适用场景

### 🎯 目标用户群体
- **开发者**：快速查找项目文件、获取编程帮助
- **内容创作者**：管理媒体素材、获取创作灵感
- **办公人员**：高效文件管理、日常问题咨询
- **学生**：学习资料检索、学术问题解答

### 💼 典型使用场景
1. **代码开发**：快速定位项目文件，询问编程问题
2. **文档管理**：搜索各类文档，整理知识库
3. **创意工作**：头脑风暴，获取灵感启发
4. **日常办公**：文件查找，效率工具集成

## 项目价值

EverythingAgent 不仅仅是一个简单的工具集合，它代表了一种新的桌面交互范式——将 AI 能力无缝集成到用户的日常工作流程中。通过极简的交互设计和强大的功能整合，该项目致力于提升用户的工作效率和创造力，成为每个 Windows 用户桌面上不可或缺的智能助手。

---
*项目遵循 MIT 开源许可证*