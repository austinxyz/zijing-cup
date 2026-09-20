## ADDED Requirements

### Requirement: 载入阵型回填名字，按钮随名在「存为阵型/更新」间切换

载入(load)一套 preset 后,「阵型名」输入框 SHALL 自动填上该 preset 的名字,使「改约束再存回同一套」
不必手动重打原名。「存为阵型」按钮的文案 SHALL 由**当前输入的名字是否命中某个已存 preset 名**推导:命中
→ 显示「更新「<名>」」;否则 → 「存为阵型」;随用户改名实时切换(改新名→新建、改回原名→更新)。

保存路径 MUST NOT 改变:仍读**实时表单**约束(`constraintsFromForm`,不读 URL),同名保存复用既有「同名即
更新」语义(后端覆盖那套,不堆重复)。回填/文案是纯前端增强:载入链接 SHALL 多带一个 `preset=<名字>`(URL
编码)参数携带名字,`locks/pins/ex` 参数不变。回填 MUST NOT 覆盖用户正在输入的字(仅在载入的 preset 名变化时
seed)。保存/更新控件仍只在编辑模式(`canEdit && editing`)出现(现状不变)。

#### Scenario: 载入后名字回填
- **WHEN** 载入一套名为「主力」的 preset(编辑模式)
- **THEN** 「阵型名」输入框初值为「主力」,按钮显示「更新「主力」」

#### Scenario: 改约束后一键存回
- **WHEN** 载入「主力」→ 改一个锁定 → 点「更新「主力」」
- **THEN** 以「主力」+ 当前实时表单约束调 `savePreset`,覆盖那套(同名更新,不新建)

#### Scenario: 改成新名变新建
- **WHEN** 名字框里把「主力」改成一个未用过的名字
- **THEN** 按钮变回「存为阵型」,保存则新建一套

#### Scenario: 载入链接携带名字
- **WHEN** 生成某 preset 的载入链接(`buildLoadHref`)
- **THEN** 链接含 `preset=<URL 编码的名字>`,且 `locks/pins/ex` 参数不变

#### Scenario: 不覆盖正在输入
- **WHEN** 用户正在名字框打字(未再载入别的 preset)
- **THEN** 回填 effect 不触发、不覆盖用户输入
