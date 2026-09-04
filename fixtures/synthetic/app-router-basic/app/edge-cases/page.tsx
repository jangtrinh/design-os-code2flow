import Link from "next/link";
import { EDGE_PATH } from "./lib/index.js";
export default async function EdgeCases({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = sp.tab;
  return (
    <main>
      <Link href={`${EDGE_PATH}?tab=50%`}>Half</Link>
      <Link href="/edge-cases?tab=%E0%A4%A">Broken escape</Link>
      {tab === "a" ? <span /> : null}
    </main>
  );
}
