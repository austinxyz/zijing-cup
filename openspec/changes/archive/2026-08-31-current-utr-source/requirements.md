# requirements —— 指针

真正的需求文档在版本库的 `docs/` 下，与其他 change 的放在一起：

> [docs/superpowers/specs/2026-08-31-current-utr-source-requirements.md](../../../docs/superpowers/specs/2026-08-31-current-utr-source-requirements.md)

这里放一个指针而不是正文，是因为 openspec 1.11.0 起不再允许 schema 的 `generates`
用 `../` 跳出 change 目录（`openspec schema fork` 会把那种路径改掉）。真文档仍由
`/opsx:explore` 写在 `docs/` 下——那是它和 mocks 的固定住处，跨 change 便于对照。

在此之前，requirements 与 mocks 两个产物的 `generates` 写的是字面量 `{{date}}`，
CLI 不做替换，于是 `openspec status` 永远把这两项显示成未完成。改用指针之后
状态检查第一次真的有意义。

Status: REVIEWED（以真文档的 frontmatter 为准）
