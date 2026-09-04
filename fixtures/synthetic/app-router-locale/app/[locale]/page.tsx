import Link from "next/link";
function SectionDivider({ from, to }: { from: string; to: string }) { return <hr data-from={from} data-to={to} />; }
export default function Home() {
  return (
    <main>
      <h1>Xoài Tứ Quý</h1>
      <SectionDivider from="brand" to="brand-cream" />
      <Link href="/vi/about">Về chúng tôi</Link>
      <Link href="/about#team">Đội ngũ</Link>
    </main>
  );
}
