import Link from "next/link";
import { NAV_ITEMS } from "./nav-items";
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div><nav>{NAV_ITEMS.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}<Link href="/pricing">Pricing</Link></nav>{children}</div>;
}
