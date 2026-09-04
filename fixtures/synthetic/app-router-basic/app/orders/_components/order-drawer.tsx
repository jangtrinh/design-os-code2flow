"use client";
import { useRouter } from "next/navigation";
export function OrderDrawer({ closeHref }: { closeHref: string }) {
  const router = useRouter();
  return <div><button onClick={() => router.push(closeHref)}>Close</button></div>;
}
