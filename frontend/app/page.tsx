import { getHealth } from "@/lib/api";

export default async function Page() {
  try {
    const health = await getHealth();
    return (
      <main className="p-8 font-sans">
        <h1 className="text-2xl font-bold">Zijing Cup Analysis</h1>
        <p className="mt-4">Backend: {health.status}</p>
        <p>Database: {health.db}</p>
      </main>
    );
  } catch {
    return (
      <main className="p-8 font-sans">
        <h1 className="text-2xl font-bold">Zijing Cup Analysis</h1>
        <p className="mt-4 text-red-600">Could not reach backend.</p>
      </main>
    );
  }
}
