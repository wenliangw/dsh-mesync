# mesync Wiki 初始化与维护

首次进入项目时，按本文件完成 Wiki 的初始化与维护。文档结构、各文档写什么见 `.mesync/rules/_sync_wiki.rule.md`，生成心法见 `.mesync/skills/_sync_wiki.skill.md`，这里只讲操作步骤。

## 你要做什么

1. **判断项目状态**

   检查 `.mesync/overview.md` 是否存在：
   - 不存在（首次）→ 从头探索项目，生成完整 wiki。
   - 已存在 → 只留意代码变化，有变化就增量更新，无需重头生成。

2. **探索并生成/更新文档**

   按 `.mesync/rules/_sync_wiki.rule.md` 的结构和要求，用 `glob`/`read`/`grep` 探索项目，再生成对应 md 文档。

3. **写盘并同步**

   用 `write` 工具把文档写入 `.mesync/` 下（路径必须以 `.mesync/` 开头）。写完调用 `mesync_sync_wiki` 同步索引。

4. **继续处理用户任务**

   完成后继续用户的任务。项目没明显架构/业务/约束可写时，不要硬凑，准确优先于完整。
