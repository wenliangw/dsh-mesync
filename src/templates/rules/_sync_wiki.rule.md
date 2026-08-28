# mesync Wiki 同步规则

## mesync 是什么

mesync 是一个项目级记忆系统，运行在 DeepSeek Harness (dsh) 中。它的核心职责是：
**自动维护项目的认知文档（wiki）**，让后续的 Agent 在接手项目时，无需用户重新解释，
就能快速理解项目的架构、业务、模块和约束。

你（LLM）是 mesync 的项目认知维护者。当你被调用时，你的任务是分析项目并
生成/更新符合本规则的 wiki 文档。

## Wiki 目录结构

wiki 文档存放在项目的 .mesync/ 目录下：

```
.mesync/
├── overview.md          # 项目速览：项目简介 + 各模块索引（入口文档）
├── wiki/
│   ├── architecture.md  # 架构：分层、模块划分、技术选型、设计模式
│   ├── business.md      # 业务：核心业务概念、业务模块、业务规则
│   ├── modules/         # 模块细节：每个模块的功能逻辑、调用关系
│   │   └── <module>.md
│   └── constraints.md   # 约束：环境约束、性能约束、安全约束
└── rules/
    └── _sync_wiki.rule.md  # 本规则文件
```

## 生成规范

### overview.md（入口）
- **项目简介**：一段话说明项目是什么、解决什么问题
- **技术栈**：语言、框架、构建工具、数据库等
- **模块索引**：列出各模块，每个模块一行简介 + 指向 wiki/modules/<module>.md 的链接
- 保持简洁，是「速览」，不是「详述」。详细内容放 wiki/ 下对应文档。

### wiki/architecture.md
- 架构分层（如表现层/业务层/数据层）
- 模块之间的依赖关系
- 关键技术选型及理由
- 设计模式的使用

### wiki/business.md
- 核心业务概念
- 业务模块划分
- 关键业务规则

### wiki/modules/<module>.md
- 该模块的职责
- 功能逻辑（怎么实现的）
- 调用关系（依赖谁、被谁依赖）
- 对外接口

### wiki/constraints.md
- 环境约束（如内存、平台）
- 性能约束
- 安全约束
- 其他约定

## 更新规范

- **增量更新**：只更新「发生变化」的部分，不重写整个 wiki
- **首次生成**：如果 wiki 为空，做一次全量分析，生成 overview.md + 各分类文档
- **变更判断**：根据 git diff 判断变更性质：
  - 架构变更 → 更新 architecture.md 和 overview.md 的索引
  - 新模块 → 新增 wiki/modules/<module>.md + 更新 overview.md 索引
  - 功能细节变更 → 更新对应 module 文档
  - 纯重构（不改变对外行为）→ 更新对应 module 文档的实现描述
- **语言**：文档使用中文撰写
- **格式**：使用 Markdown，结构清晰，标题层级合理
