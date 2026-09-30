import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { Scanner } from "@/components/scanner";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await session())) redirect("/login?next=/scanner");
  return <Scanner />;
}
