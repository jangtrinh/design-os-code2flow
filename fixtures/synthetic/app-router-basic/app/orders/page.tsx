import { AppShell } from "@/components/shell/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderDrawer } from "./_components/order-drawer";
import { hrefWith } from "@/lib/href-with";
export const ORDERS_PATHNAME = "/orders";
function first(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }
export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = first(sp.tab) === "archived" ? "archived" : "open";
  const drawer = first(sp.drawer);
  if (sp.legacy) redirect(hrefWith(ORDERS_PATHNAME, sp, { legacy: undefined }));
  const openHref = hrefWith(ORDERS_PATHNAME, sp, { drawer: "details" });
  return (
    <AppShell><main>
      <Link href={`${ORDERS_PATHNAME}?tab=archived`}>Archived</Link>
      <Link href={openHref}><button>Details</button></Link>
      {drawer === "details" ? <OrderDrawer closeHref={ORDERS_PATHNAME} /> : null}
    </main></AppShell>
  );
}
