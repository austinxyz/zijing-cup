"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Shown when a lineup search cannot be fetched — most often the backend being
 * cold, and a search is the slowest request this app makes.
 *
 * Scoped to this route so it replaces the result area only: the sidebar and
 * the lock controls stay, and the controls are how you narrow the search that
 * just timed out.
 *
 * It says the request failed, never anything about lineups. "Could not ask"
 * and "there is no legal lineup" are different answers, and this feature
 * exists to keep exactly that kind of pair apart.
 *
 * `error` is accepted and not displayed: Next passes it to every boundary,
 * and its message is a server-side detail. Named so a logger has somewhere to
 * attach when this app grows one, as the sibling boundaries do.
 */
export default function LineupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-start justify-center px-6 py-14">
      <Card className="w-[420px] max-w-full">
        <CardHeader>
          <CardTitle>无法搜索阵容</CardTitle>
          <CardDescription>
            后端没有响应，这次搜索没有跑起来。免费实例闲置后会休眠，冷启动可能要接近一分钟；阵容搜索本身也是最慢的一个请求，稍候重试通常就好了。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </div>
  );
}
