"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Route-local boundary so a failed sampling fetch replaces only this page, not
 * the whole window. A cold free-tier backend can time out; without a local
 * boundary that would blow past to the app-wide error page.
 */
export default function ParticipationUtrError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-start justify-center px-6 py-14">
      <Card className="w-[420px] max-w-full">
        <CardHeader>
          <CardTitle>无法加载参赛 UTR 采样</CardTitle>
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
