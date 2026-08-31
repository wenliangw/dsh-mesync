<p align="center">
  <b>🔮 让 Agent 更了解你的项目</b>
  <br/>
  <sub>基于 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 的项目级记忆插件</sub>
</p>

Mesync 持续维护三块记忆——**项目认知（Wiki）**、**品味（Taste）**、**决策（Decision）**——让 Agent 每次对话都了解项目的架构、你的代码偏好、以及过往决策的来龙去脉。

---

## ⚠️ 使用前请注意

**Mesync 目前处于早期测试阶段**，请务必了解：

- **会增加 Token 消耗**：每次对话都会注入记忆上下文；发起对话时会检查是否已有认知文档，若没有则会探索整个项目生成认知文档，这些都会额外调用 LLM。
- **建议先在小型项目中尝试**：暂不建议在大型项目中使用——全量探索大型代码库会带来较高的 Token 和时间开销。
- 行为可能与预期有偏差，欢迎反馈问题。

---

## 如何使用

### 1. 安装（通过 dsh 的 profile 机制）

Mesync 已发布到 npm（目前为 rc 版本），通过 dsh 的 profile 机制安装即可，无需源码编译：

```bash
dsh plugin --profile myprofile add dsh-mesync@rc
```

> - `myprofile` 是 profile 名字（可自定义），即一套插件+配置的组合，存于 `~/.dsh/profiles/myprofile/`。
> - 该命令会自动创建 profile、把 `dsh-mesync` 装进它的依赖，并自动加入 bundle 层，无需手写任何补丁。
> - 目前最新为 `0.1.0-rc.3`，`@rc` 会跟随 rc 系列的最新版本。

### 2. 启动

```bash
dsh --profile myprofile
```

### （可选）自定义配置

如需覆盖默认配置，在 profile 的补丁文件 `~/.dsh/profiles/myprofile/cordis.patch.yml` 中按 id 覆盖：

```yaml
- id: mesync
  config:
    maxContextDecisions: 10   # 注入上下文时最多带几条决策（默认 5）
```

### 3. 开始使用

打开 dsh 后，选择一个项目 workspace 新建会话即可。Mesync 会自动：

- 发起对话时检查项目认知文档，若不存在则探索整个项目生成
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
