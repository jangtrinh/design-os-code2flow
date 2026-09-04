import { AppShell } from "@/components/shell/app-shell";

type Props = { searchParams: Promise<{ tab?: string }> };

const tabs = ["overview", "pricing", "faq"] as const;

export default async function ProductPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const activeTab = tabs.includes(tab as (typeof tabs)[number]) ? (tab as (typeof tabs)[number]) : "overview";
  return (
    <AppShell>
      {activeTab === "overview" && <section>Overview content</section>}
      {activeTab === "pricing" && <section>Pricing content</section>}
    </AppShell>
  );
}
