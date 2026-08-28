"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * The root page resolves the current season from the backend before it can
 * redirect anywhere, so a backend outage fails before any shell exists to
 * hold an error state. This boundary is what the visitor sees instead of
 * Next's default crash screen.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-6 py-16">
      <Card className="w-[420px] max-w-full">
        <CardHeader>
          <CardTitle>无法连接后端</CardTitle>
          <CardDescription>
            没能取到赛季列表，所以还不知道该带你去哪一届。免费实例闲置后会休眠，冷启动可能要接近一分钟。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </main>
  );
}
