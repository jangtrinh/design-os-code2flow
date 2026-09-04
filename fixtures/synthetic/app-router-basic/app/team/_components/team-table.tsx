import Link from "next/link";
function buildColumns(editHref: (id: string) => string) {
  return [{ cell: (row: { id: string }) => <Link href={editHref(row.id)}>Edit</Link> }];
}
export function TeamTable({ editHref }: { editHref: (id: string) => string }) {
  const columns = buildColumns((id) => editHref(id));
  return <table>{columns.length}</table>;
}
