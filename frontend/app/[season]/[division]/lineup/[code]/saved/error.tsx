"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Shown when the saved-lineups page cannot be fetched — most often the backend
 * being cold. Scoped to this route so a failure here replaces only the saved
 * list, never the sidebar: without its own boundary a cold-start timeout would
 * fall through to the root boundary and blank the whole app.
 *
 * `error` is accepted and not displayed: its message is a server-side detail,
 * kept named so a logger has somewhere to attach, as the sibling boundaries do.
 */
export default function SavedLineupsError({
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
          <CardTitle>无法加载已存阵容</CardTitle>
          <CardDescription>
            后端没有响应，这次没有取到已存阵容。免费实例闲置后会休眠，冷启动可能要接近一分钟；稍候重试通常就好了。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </div>
  );
}
