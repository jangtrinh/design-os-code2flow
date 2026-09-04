"use client";
import Link from "next/link";
export function Wizard({ step, basePath }: { step: number; basePath: string }) {
  const stepHref = (next: number) => {
    const query = new URLSearchParams({ draft: "1" });
    const slug = next === 2 ? "details" : next === 3 ? "review" : "";
    if (slug) query.set("step", slug);
    return `${basePath}?${query.toString()}`;
  };
  return <Link href={stepHref(step + 1)}>Continue</Link>;
}
