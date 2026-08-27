# 能力清单

`openspec/specs/` 下每个目录是一个已归档的能力（capability）。这里维护一份清单，方便快速找到"这功能是哪个 change 做的、覆盖了什么"。

---

_尚无已归档能力。第一个 change 归档后在此登记。_

## 规划中的能力（路线图）

| 能力 | 说明 | 状态 |
|---|---|---|
| `project-bootstrap` | 可运行可部署的骨架：FastAPI `/health`、Next.js 占位首页、`zijing_cup` schema 首个 migration、Render/Vercel 接线 | 📋 待 propose |
| `roster-import` | 球队/球员/roster 数据模型 + UTR 取数策略 | 📋 规划中 |
| `roster-display` | 前端浏览球队/球员/UTR | 📋 规划中 |
| `lineup-engine` | 移植 MatchApp 策略模式阵容优化引擎（Top-5 候选阵容、UTR cap、固定搭档） | 📋 规划中 |
| `lineup-ui` | 前端锁定搭档 + 阵容对比交互界面 | 📋 规划中 |
