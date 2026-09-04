"use client";
import { useRouter } from "next/navigation";
export function CheckoutButton() {
  const router = useRouter();
  return <button onClick={() => router.push("/docs/getting-started")}>Checkout</button>;
}
