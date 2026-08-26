# dsh-mesync

<p align="center">
  <b>🔮 让 Agent 更了解你的项目</b>
</p>

基于 DeepSeek Harness 的项目级记忆插件。自动记录架构决策、代码品味和项目现状，让每次对话都在同一个频道上。

## 快速开始

### 安装

```bash
git clone https://github.com/wenliangw/dsh-mesync
cd dsh-mesync
npm install
```

在 dsh 项目根目录创建 `mesync.yml`：

```yaml
- insert:
    - id: mesync
      name: '/absolute/path/to/dsh-mesync/src/index.ts'
      config:
        dbPath: '.mesync/resonance.db'
        autoExtract: true
        tastePath: '.mesync/tastes/'
        maxContextDecisions: 5
```

启动 dsh 时加载：

```bash
pnpm dsh web --patch ./mesync.yml
```

### 配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dbPath` | string | `.mesync/resonance.db` | SQLite 数据库路径 |
| `extractModel` | string | `""` | 提取用模型，空 = 复用当前模型 |
| `autoExtract` | boolean | `true` | 是否自动提取决策 |
| `tastePath` | string | `.mesync/tastes/` | 品味声明目录（支持目录批量加载） |
| `maxContextDecisions` | number | `5` | 注入上下文时最多带几条决策 |

## 工具

Mesync 注册 4 个 Agent 工具：

### recall — 搜索记忆

搜索历史决策、品味信号和反模式。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词 |
| `mode` | string | 否 | `"decisions"` / `"taste"` / `"all"`（默认） |

### remember — 记录决策

手动标记一个决策节点。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `decision` | string | 是 | 做了什么决策 |
| `rationale` | string | 是 | 为什么做这个决策 |
| `trigger` | string | 否 | 触发场景 |
| `alternatives` | string | 否 | 备选方案，JSON 数组 `[{"option":"...","why_not":"..."}]` |
| `taste_signals` | string | 否 | 品味信号，JSON 数组 `[{"signal":"...","context":"..."}]` |
| `outcome` | string | 否 | 结果：`"adopted"`（默认）/ `"reverted"` / `"refined"` / `"pending"` |
| `caused_by` | string | 否 | 因果链上游节点 ID |

### taste_add — 添加品味

添加一条品味偏好。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `signal` | string | 是 | 品味信号，如 `"prefer-explicit-over-implicit"` |
| `context` | string | 否 | 具体说明或示例 |
| `weight` | number | 否 | 重要性权重 0-1（默认 0.5） |

### reality — 查看项目现状

查看当前项目快照，无需参数。

## 手动品味声明

在 `.mesync/tastes/` 目录下创建 `.md` 文件，按主题分类：

```
.mesync/tastes/
├── code-style.md      # 代码风格
├── architecture.md    # 架构偏好
└── patterns.md        # 模式偏好
```

文件格式（每行一条信号）：

```markdown
# 代码风格
prefer-explicit-over-implicit: 不用 any/dyn 除非必要
avoid-premature-generalization: 先做具体实现，验证后再抽象

# 架构偏好
favor-composition-over-inheritance: 优先组合而非继承
```

支持 `#` 注释行，空行忽略。也支持单文件 `.mesync/tastes.md`。

## 工作流程

```
session 启动 → 注入同频记忆上下文（因果链摘要 + 品味画像 + 项目现状）
    ↓
每个 turn → 按任务匹配注入相关决策
    ↓
turn 结束 → 检测决策信号 → 自动提取决策节点 + 更新品味
```

## 决策信号

自动提取在以下情况触发：

- 用户显式说"记住"
- 同一功能/文件反复调整 >= 3 次
- 用户明确让 Agent 选择方案
- 复杂需求涉及多模块

## 成本

自动提取会额外调用 LLM，预估开销占对话次数的 **5-15%**。可通过以下方式控制：

- `autoExtract: false` 关闭自动提取，完全依赖手动 `remember`
- `extractModel` 配置更便宜的模型专门做提取

## 当前限制

Phase 1 版本，已知限制：

- TurnSummary 为简化版，决策信号检测主要依赖显式"记住"关键词
- 完整的 session event 流收集将在后续版本实现
- 暂无 Web UI 配置界面，通过 `cordis.yml` 配置

## 项目结构

```
src/
├── index.ts             # Cordis 插件入口
├── db.ts                # SQLite 操作层
├── tools.ts             # Agent 工具注册
├── detector.ts          # 决策信号检测
├── extractor.ts         # LLM 提取逻辑
├── context-injector.ts  # 上下文格式化注入
├── reality.ts           # 项目现状扫描
├── decisions.ts         # 决策管理
└── taste.ts             # 品味管理
```

## 存储

所有数据在项目根目录 `.mesync/` 下：

- `resonance.db` — SQLite 数据库
- `tastes/` — 品味声明文件

## License

MIT