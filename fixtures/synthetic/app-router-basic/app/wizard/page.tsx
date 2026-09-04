import { AppShell } from "@/components/shell/app-shell";
import { Wizard } from "./_components/wizard";
export default async function WizardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const step = sp.step === "details" ? 2 : sp.step === "review" ? 3 : 1;
  return <AppShell><Wizard step={step} basePath="/wizard" /></AppShell>;
}
