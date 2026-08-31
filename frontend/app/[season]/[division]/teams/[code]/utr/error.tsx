"use client";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Shown when the UTR sheet cannot be fetched — most often the backend being
 * cold.
 *
 * Scoped to this route so it replaces this panel only. Without a boundary of
 * its own the failure climbs to the root one, and a single cold-start timeout
 * turns "this panel did not load" into "the whole app is broken", with the
 * sidebar gone and no way back to the roster.
 *
 * `error` is accepted and not displayed, the same way the sibling roster
 * boundary takes it: its message is a server-side detail, and a logger will
 * want somewhere to attach if this app ever grows one.
 */
export default function UtrSheetError({
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
          <CardTitle>无法加载当前 UTR 表</CardTitle>
          <CardDescription>
            后端没有响应。免费实例闲置后会休眠，冷启动可能要接近一分钟，稍候重试通常就好了。名单页不受影响，可以先回去看。
          </CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={reset}>
          重试
        </Button>
      </Card>
    </div>
  );
}
