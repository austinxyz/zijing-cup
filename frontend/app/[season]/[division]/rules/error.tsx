"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Shown when the rules cannot be fetched — most often the backend being cold.
 * Render lives below the layout, so the sidebar stays put and only this
 * region is replaced.
 */
export default function RulesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-w-0 flex-1 items-start justify-center bg-background px-6 py-14">
      <Card className="w-[420px] max-w-full">
        <CardHeader>
          <CardTitle>无法加载赛制规则</CardTitle>
          <CardDescription>
            后端没有响应。免费实例闲置后会休眠，冷启动可能要接近一分钟，稍候重试通常就好了。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </main>
  );
}
