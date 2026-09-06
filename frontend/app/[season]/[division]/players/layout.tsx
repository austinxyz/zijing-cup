/**
 * 队员管理板块的 layout。
 *
 * 这里**不再** gate 整个板块——队员数据本就在名单页公开，查看任人可读（与队伍/阵容页一致）。
 * 编辑权按比赛判、写控件按查看/编辑模式显隐，都在页面内处理（见 `PlayerEditContext` /
 * `PlayerEditHeaderControl`），而不是在这里把非编辑者重定向走。
 *
 * 保留这个 layout 作为板块的组合点（将来如需板块级 error 边界等）。
 */
export default async function PlayersLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ season: string; division: string }>;
}) {
  return <>{children}</>;
}
