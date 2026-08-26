# Mesync — 同频记忆引擎

<p align="center">
  <b>🔮 让 Agent 和你在同一个项目频率上共振</b>
</p>

Mesync 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件，实现项目级**同频记忆**（Resonance Memory）的自动提取与注入。

## 什么是同频记忆？

Agent 在项目中工作，但每次新会话、每个新 Agent 都从零开始理解项目——用户需要反复解释架构决策、代码品味、业务逻辑。同频记忆让 Agent **和用户有相同的项目理解**，实现一致的迭代能力。

Mesync 维护三个维度的项目记忆：

| 维度 | 内容 | 用途 |
|------|------|------|
| **因果链** DecisionGraph | 架构决策及备选方案、业务逻辑演变 | 遇到类似场景时有据可循 |
| **品味** TasteProfile | 代码风格偏好、质量标准、反模式 | 产出符合用户标准 |
| **项目现状** ProjectReality | 技术栈、模块结构、约束条件 | 快速了解项目 |

## 快速开始

### 前置条件

- Node.js 22.19+
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 运行环境

### 安装

```bash
# 在 dsh 项目根目录的 cordis.yml 中添加
- insert:
    - id: mesync
      name: 'mesync'
      config:
        autoExtract: true
```

### 工具

Mesync 注册 4 个 Agent 工具：

- **`recall`** — 搜索历史决策、品味信号
- **`remember`** — 手动标记决策节点
- **`taste_add`** — 添加品味偏好
- **`reality`** — 查看项目现状

### 配置

```yaml
config:
  dbPath: '.dsh-resonance/resonance.db'  # 数据库路径
  extractModel: ''                        # 提取模型（空 = 复用当前）
  autoExtract: true                       # 是否自动提取
  tasteManualPath: '.dsh-resonance/taste.manual.md'  # 品味声明文件
  maxContextDecisions: 5                  # 注入上下文最大决策数
```

### 手动品味声明

在项目根目录创建 `.dsh-resonance/taste.manual.md`：

```markdown
# Project Taste

- prefer-explicit-over-implicit: 类型系统充分利用，不用 any/dyn 除非必要
- avoid-premature-generalization: 先做具体实现，验证后再抽象
- avoid-patch-fixes: 修复必须按架构重构，不允许补丁式绕过
```

## 成本说明

Mesync 在检测到决策信号时会额外调用 LLM 提取记忆。触发条件：
- 用户显式说"记住"
- 同一功能/文件反复调整 >= 3 次
- 用户明确让 Agent 选择方案
- 复杂需求涉及多模块

预估额外开销占对话次数的 **5-15%**。可通过 `autoExtract: false` 关闭自动提取，完全依赖手动 `remember` 工具。

## 存储

所有数据存储在项目根目录 `.dsh-resonance/resonance.db`（SQLite），对用户透明。

## License

MIT