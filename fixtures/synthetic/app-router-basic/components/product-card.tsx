import Link from "next/link";

export function ProductCard({ product }: { product: { href: string; name: string } }) {
  return <article><Link href={product.href}>{product.name}</Link></article>;
}
