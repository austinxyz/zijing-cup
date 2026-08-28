"use client";

/**
 * A roster that failed to load.
 *
 * Scoped to this route so it replaces the roster only: the sidebar and the
 * team list stay, and the list is how you reach another team — which is
 * exactly what you want after one fails to load.
 */
export default function RosterError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-[380px] flex-col items-center gap-3 text-center">
        <div className="text-sm font-medium text-foreground">
          名单没能加载出来
        </div>
        <div className="text-[12.5px] leading-relaxed text-muted">
          后端可能正在从休眠中唤醒，第一次访问会慢上近一分钟。稍等片刻再试，
          或从左侧选另一支球队。
        </div>
        <button
          type="button"
          onClick={reset}
          className="h-8 rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground hover:bg-surface-muted"
        >
          重试
        </button>
      </div>
    </div>
  );
}
