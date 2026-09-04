import { AppShell } from "@/components/shell/app-shell";
import { TeamTable } from "./_components/team-table";
const PATHNAME = "/team";
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const drawer = sp.drawer;
  return <AppShell><TeamTable editHref={(id: string) => `${PATHNAME}?drawer=edit&member=${id}`} />{drawer === "edit" ? <div /> : null}</AppShell>;
}
