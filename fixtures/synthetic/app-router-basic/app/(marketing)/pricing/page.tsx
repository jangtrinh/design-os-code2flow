export const metadata = { title: "Pricing plans" };
import { AppShell } from "@/components/shell/app-shell";
import Link from "next/link";
import { CheckoutButton } from "./_components/checkout-button";
const FEATURED_POSTS = [{ href: "/blog/hello-world", label: "Hello world" }, { href: "/blog/second-post", label: "Second post" }];
export default function Pricing(){return <AppShell><main>{FEATURED_POSTS.map((p) => <Link key={p.href} href={p.href}>{p.label}</Link>)}<CheckoutButton /></main></AppShell>}
