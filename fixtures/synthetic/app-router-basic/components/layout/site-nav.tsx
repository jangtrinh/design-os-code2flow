import Link from "next/link";

const links = [["Team", "/team"], ["Wizard", "/wizard"]] as const;

export function SiteNav() {
  return (
    <nav>
      <Link href="/about">About</Link>
      {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
    </nav>
  );
}
