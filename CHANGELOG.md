# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0-rc.3] - 2026-08-30

### 新增

- 决策增加 `scopes` 字段（多归属分类标签，软关联，复用 wiki/品味分类路径），支持按分类缩小决策检索范围。
- 新增 `recall_detail` 工具：按 id 拉取单条决策的完整内容（rationale/alternatives/因果链/scopes）。

### 变更

- `recall` 工具改为返回**决策摘要列表**（id + 一句话 + outcome + scopes），支持 `scope`/`query` 参数，默认上限 50，不再返回全量详情。
- `remember` 工具新增 `scopes` 参数。

### 移除

- 删除 `autoExtract` 配置——总纲是 mesync 的设计基础必须始终注入，不提供开关；禁用 mesync 请用 dsh 的插件禁启机制（`disabled: true`）。

### 修复

- 清理 `test/` 下三个已失效的死测试（detector/taste/wiki-git），修复 connection 测试。

## [0.1.0-rc.2] - 2026-08-30

### 修复

- 修复 skill/rule 文档中的文件路径引用不明确问题：统一为 `.mesync/` 前缀的完整路径，并在总纲中新增「文件位置约定」，避免主 Agent 在服务器上全盘搜索找不到文件。

## [0.1.0-rc.1] - 2026-08-30

### 修复

- 修复 bundle 配置 `cordis.patch.yml` 中插件 `name` 仍为旧包名 `mesync`，改为包名 `dsh-mesync`；移除已废弃的 `dbPath`/`tastePath` 配置字段，仅保留 `autoExtract` 和 `maxContextDecisions`。

## [0.1.0-rc.0] - 2026-08-30

### 概览

首个发布候选版本。Mesync 是一个基于 DeepSeek Harness 的项目级记忆插件，持续维护三块记忆——**项目认知（Wiki）**、**品味（Taste）**、**决策（Decision）**——让 Agent 更了解你的项目。

### 核心特性

- **项目认知（Wiki）**：自动探索项目、生成架构/业务/模块/约束等认知文档，存 `.mesync/` 下的 Markdown。
- **品味（Taste）**：从决策和用户反馈中沉淀代码偏好，分门别类存 `.mesync/tastes/` 下的 Markdown。
- **决策（Decision）**：记录有意义的取舍及因果链（`caused_by`/`supersedes`），存 SQLite。
- **会话内惰性触发**：不做后台循环生成，由主 Agent 按规则自然识别、生成、维护记忆。
- **零硬编码提示词**：所有规则、心法均为 md 文件（`rules/` + `skills/`），用户可直接修改，代码只读文件注入。
- **决策演化闭环**：用户否定时追加新决策节点、延伸因果链，而非覆盖历史。
- **可演化记忆**：决策、品味、项目认知随对话持续沉淀与修正。

### 设计原则

- 三块记忆不互斥，一条信息可同时属于多块。
- 记忆读写「惰性触发」，融入自然对话，不打断任务。
- 识别交给 LLM，不硬编码分类或规则。

### 工具

提供 `recall` / `remember` / `reality` / `mesync_sync_wiki` 四个 Agent 工具。

### 已知限制

早期测试阶段，建议先在小项目中尝试。会增加 Token 消耗。
