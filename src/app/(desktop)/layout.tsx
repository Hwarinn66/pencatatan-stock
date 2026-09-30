import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await session();
  if (!user) redirect("/login");
  return <Shell username={user.username}>{children}</Shell>;
}
