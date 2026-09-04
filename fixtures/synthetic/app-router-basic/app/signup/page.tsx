import { AppShell } from "@/components/shell/app-shell";

type Props = { searchParams: Promise<{ step?: string }> };

const steps = ["account", "plan", "confirm"] as const;

export default async function SignupPage({ searchParams }: Props) {
  const { step } = await searchParams;
  const activeStep = steps.includes(step as (typeof steps)[number]) ? (step as (typeof steps)[number]) : "account";
  return (
    <AppShell>
      {activeStep === "account" && <form>Account form</form>}
      {activeStep === "plan" && <form>Plan form</form>}
    </AppShell>
  );
}
