import { AppShell } from "@/components/shell/app-shell";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
export default function Home({ ok }: { ok: boolean }) {
  if (!ok) notFound();
  if (ok === undefined) redirect("/"); // self-loop normalization, must be counted not drawn
  return (
    <AppShell><main>
      <Link href="/pricing"><button>See pricing</button></Link>
      <a href="https://example.com">Docs</a>
      <a href="#features">Features</a>
      <form action="/blog/new-post">Post</form>
      <Link href="/nowhere">Broken</Link>
    </main></AppShell>
  );
}
