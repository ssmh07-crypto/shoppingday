import { redirect } from "next/navigation";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  redirect(`/admin/products?edit=${encodeURIComponent((await params).id)}`);
}
