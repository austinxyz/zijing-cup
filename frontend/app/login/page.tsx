import { LoginForm } from "./LoginForm";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The login screen.
 *
 * Deliberately outside the app shell: nothing behind this page is reachable
 * without a session, so a sidebar here would be a set of controls that all
 * lead back to where you already are.
 */
export default async function LoginPage({ searchParams }: PageProps) {
  await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-14">
      <LoginForm />
    </main>
  );
}
