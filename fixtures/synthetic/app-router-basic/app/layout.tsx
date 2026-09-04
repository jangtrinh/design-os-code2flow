import { SiteNav } from "@/components/layout/site-nav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <header>
          <SiteNav />
        </header>
        {children}
      </body>
    </html>
  );
}
