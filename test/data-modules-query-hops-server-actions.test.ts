import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ingest } from "../src/parser/ingest.js";
import { copyFixture } from "./helpers/fixture-copy.js";

const edge = (graph: Awaited<ReturnType<typeof ingest>>, source: string, target: string, href?: string) => graph.edges.find((candidate) => candidate.source === source && candidate.target === target && (!href || candidate.href === href));

function patternFixture(): { dir: string; cleanup: () => void } {
  const fixture = copyFixture("data-module-query-hop-server-action");
  const put = (path: string, source: string): void => { mkdirSync(join(fixture.dir, path, ".."), { recursive: true }); writeFileSync(join(fixture.dir, path), source); };
  put("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["*"] } } }));
  put("data/products.ts", 'export const products = [{ slug: "omniact", href: "/products/omniact" }, { slug: "code2flow", href: "/products/code2flow" }];\n');
  put("app/products/page.tsx", 'import Link from "next/link"; import { products } from "@/data/products"; export default function Products(){ return <main>{products.map((product, index) => { const previous = products[(index + products.length - 1) % products.length]; return <section key={product.slug}><Link href={product.href}>{product.slug}</Link><Link href={previous.href}>Previous</Link></section>; })}</main>; }\n');
  put("app/products/[slug]/page.tsx", 'import Link from "next/link"; const tabs = ["overview", "details"] as const; export default function ProductDetail({ searchParams }: { searchParams: { productUrl?: string; tab?: string; modal?: string } }) { const { modal } = searchParams; const productUrl = searchParams.productUrl; const activeTab = tabs.includes(searchParams.tab as (typeof tabs)[number]) ? searchParams.tab : "overview"; return <main>{modal === "waitlist" && <section>Waitlist</section>}{activeTab === "overview" && <section>Overview</section>}{activeTab === "details" && <section>Details</section>}<Link href={`${productUrl}?modal=waitlist`}>Waitlist</Link>{tabs.map((item) => <Link key={item} href={`${productUrl}?tab=${item}`}>{item}</Link>)}<Link href={productUrl}>Close</Link></main>; }\n');
  put("app/signup/actions.ts", '"use server"; import { redirect } from "next/navigation"; export async function continueToPlan() { redirect("/signup?step=plan"); redirect("/signup?step=confirm"); redirect("/thanks"); }\n');
  put("app/signup/page.tsx", 'import { continueToPlan } from "./actions"; const steps = ["account", "plan", "confirm"] as const; export default function Signup({ searchParams }: { searchParams: { step?: string } }) { const activeStep = steps.includes(searchParams.step as (typeof steps)[number]) ? searchParams.step : "account"; return <main>{activeStep === "account" && <form action={continueToPlan}>Account form</form>}{activeStep === "plan" && <form>Plan form</form>}</main>; }\n');
  put("app/thanks/page.tsx", 'export default function ThanksPage(){ return <main>Thanks</main>; }\n');
  return fixture;
}

describe("ingest → imported data, same-route query hops, and server actions", () => {
  it("follows one imported data module into concrete product routes", async () => {
    const fixture = patternFixture();
    const graph = await ingest(fixture.dir);
    for (const href of ["/products/omniact", "/products/code2flow"]) {
      expect(edge(graph, "/products", "/products/[slug]", href)).toMatchObject({ confidence: "medium", pattern: "link-href-data-module", href });
    }
    expect(graph.edges.some((candidate) => candidate.source === "/products" && candidate.pattern === "link-href-data-module" && candidate.trigger === "Link: Previous")).toBe(true);
    fixture.cleanup();
  });

  it("keeps direct href props high and follows object props into imported data-module routes", async () => {
    const fixture = patternFixture();
    const put = (path: string, source: string): void => { mkdirSync(join(fixture.dir, path, ".."), { recursive: true }); writeFileSync(join(fixture.dir, path), source); };
    put("app/catalog/page.tsx", 'import { ProductCard } from "@/components/product-card"; import { ProductLink } from "@/components/product-link"; import { productCards } from "@/data/product-cards"; export default function Catalog({ searchParams }: { searchParams: { filter?: string } }){ const visibleCards = searchParams.filter ? productCards.filter((product) => product.name === searchParams.filter) : productCards; return <main><ProductLink href="/about" />{visibleCards.map((product) => <ProductCard key={product.href} product={product} />)}</main>; }\n');
    put("app/catalog/[slug]/page.tsx", 'export default function CatalogItem(){ return <main>Catalog item</main>; }\n');
    const graph = await ingest(fixture.dir);
    expect(edge(graph, "/catalog", "/about", "/about")).toMatchObject({ confidence: "high", pattern: "prop-href-literal" });
    for (const href of ["/catalog/alpha", "/catalog/beta"]) {
      expect(edge(graph, "/catalog", "/catalog/[slug]", href)).toMatchObject({ confidence: "medium", pattern: "prop-object-href-data-module", evidence: { file: "app/catalog/page.tsx", line: 1 }, trigger: "ProductCard" });
    }
    fixture.cleanup();
  });

  it("keeps unresolved bases on their dynamic source route when they name an existing State Screen", async () => {
    const fixture = patternFixture();
    const graph = await ingest(fixture.dir);
    expect(edge(graph, "/products/[slug]", "/products/[slug]?modal=waitlist")).toMatchObject({ confidence: "medium", pattern: "link-href-query-hop-same-route" });
    for (const tab of ["overview", "details"]) expect(edge(graph, "/products/[slug]", `/products/[slug]?tab=${tab}`)).toMatchObject({ confidence: "medium", pattern: "link-href-query-hop-same-route" });
    expect(edge(graph, "/products/[slug]", "/products/[slug]")).toMatchObject({ confidence: "medium", pattern: "link-href-base-same-route" });
    fixture.cleanup();
  });

  it("follows imported server actions to every literal redirect and uses redirect evidence", async () => {
    const fixture = patternFixture();
    const graph = await ingest(fixture.dir);
    for (const target of ["/signup?step=plan", "/signup?step=confirm", "/thanks"]) {
      expect(edge(graph, "/signup", target)).toMatchObject({ confidence: "medium", pattern: "form-action-server-action-redirect", evidence: { file: "app/signup/actions.ts" } });
    }
    fixture.cleanup();
  });
});
