import Link from "next/link";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>
        <Link href="/team/settings">Settings</Link>
      </nav>
      {children}
    </div>
  );
}
