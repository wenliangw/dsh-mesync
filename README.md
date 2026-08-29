<p align="center">
  <b>🔮 让 Agent 更了解你的项目</b>
  <br/>
  <sub>基于 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 的项目级记忆插件</sub>
</p>

Mesync 持续维护三块记忆——**项目认知（Wiki）**、**品味（Taste）**、**决策（Decision）**——让 Agent 每次对话都了解项目的架构、你的代码偏好、以及过往决策的来龙去脉。

---

## ⚠️ 使用前请注意

**Mesync 目前处于早期测试阶段**，请务必了解：

- **会增加 Token 消耗**：每次对话都会注入记忆上下文，首次进入项目还会探索代码、生成认知文档，这些都会额外调用 LLM。
- **建议先在小型项目中尝试**：暂不建议在大型项目中使用——全量探索大型代码库会带来较高的 Token 和时间开销。
- 行为可能与预期有偏差，欢迎反馈问题。

---

## 如何使用

### 1. 安装

```bash
git clone https://github.com/wenliangw/dsh-mesync
cd dsh-mesync
npm install
npm run build
```

### 2. 配置并加载

在你的 dsh 补丁文件（如 `mesync.yml`）中插入 Mesync 插件：

```yaml
- insert:
    - id: mesync
      name: 'dsh-mesync'
      config:
        maxContextDecisions: 5   # 注入上下文时最多带几条决策（默认 5）
```

启动 dsh 时加载：

```bash
dsh web --patch ./mesync.yml
```

### 3. 开始使用

打开 dsh 后，选择一个项目 workspace 新建会话即可。Mesync 会自动：

- 首次进入项目时，探索代码并生成项目认知文档
- 对话过程中，识别并记录决策、沉淀品味
- 每次对话注入记忆上下文，让 Agent 保持「同频」

所有记忆文件都生成在项目根目录的 `.mesync/` 下，你可以直接查看或编辑。

---

## 三块记忆

Mesync 维护三块记忆：**决策是枢纽**，连接「项目认知」与「品味」。

- **项目认知（Wiki）**：项目「是什么、怎么组织的」，存 `.mesync/` 下的 Markdown。
- **品味（Taste）**：你「喜欢、偏好什么」，存 `.mesync/tastes/` 下的 Markdown。
- **决策（Decision）**：项目「为什么这么定、取舍了什么」，存 SQLite，以因果链串联。

**三者不互斥**，一条信息可以同时属于多块。**记忆是可演化的**：决策会在你否定后追加新节点、延伸因果链（而非覆盖历史），品味会随你的偏好漂移，项目认知会随代码演进。

---

## License

[MIT](./LICENSE) © 2026 wenliangw
