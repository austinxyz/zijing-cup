"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Scoped to the player workbench so a failed fetch replaces only this pane —
 * the sidebar and nav stay. Without a route-local boundary a cold-backend
 * timeout would blow past to the app-wide boundary and blank the whole window.
 */
export default function PlayersError({
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
          <CardTitle>无法加载队员</CardTitle>
          <CardDescription>
            后端没有响应。免费实例闲置后会休眠，冷启动可能要接近一分钟，稍候重试通常就好了。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </div>
  );
}
