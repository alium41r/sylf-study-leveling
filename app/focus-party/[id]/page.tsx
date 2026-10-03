import { redirect } from "next/navigation";

export default async function FocusPartyRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/focus-party/${id}/focus`);
}
