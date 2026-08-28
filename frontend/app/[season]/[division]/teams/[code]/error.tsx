"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Shown when a roster cannot be fetched — most often the backend being cold.
 *
 * Scoped to this route so it replaces the roster only: the sidebar and the
 * team list stay, and the list is how you reach another team, which is
 * exactly what you want after one fails to load.
 *
 * `error` is accepted and not displayed. Next passes it to every error
 * boundary, and its message is a server-side detail; showing it to a captain
 * would be noise at best. Named here so a logger has somewhere to attach when
 * this app grows one — the sibling rules boundary takes it the same way.
 */
export default function RosterError({
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
          <CardTitle>无法加载名单</CardTitle>
          <CardDescription>
            后端没有响应。免费实例闲置后会休眠，冷启动可能要接近一分钟，稍候重试通常就好了。也可以从左侧换一支球队。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </div>
  );
}
