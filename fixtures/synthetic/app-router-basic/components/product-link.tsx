import Link from "next/link";

export function ProductLink({ href }: { href: string }) {
  return <Link href={href}>Direct product link</Link>;
}
