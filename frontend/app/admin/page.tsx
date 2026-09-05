import { isSuper } from "@/lib/admin";

import { setCompetitionPassword } from "./actions";
import { SuperPasswordForm } from "./SuperPasswordForm";

/**
 * Super-only console: set/rotate each competition's admin password.
 *
 * Gated on the super scope both here (the form does not render for anyone else)
 * and in the action (which refuses a non-super session). A scoped competition
 * admin who visits this URL sees only the notice.
 */
export default async function AdminPage() {
  const superAdmin = await isSuper();

  return (
    <main className="flex flex-1 flex-col gap-4 bg-background px-6 py-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-base font-semibold text-foreground">比赛密码管理</h1>
        <p className="text-[12.5px] text-muted-foreground">
          给每个比赛（赛季 + 组别）设置或轮换编辑密码。仅超级管理员可用。
        </p>
      </div>
      {superAdmin ? (
        <SuperPasswordForm action={setCompetitionPassword} />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          仅超级管理员可用。请用 super 密码登录后再来。
        </p>
      )}
    </main>
  );
}
