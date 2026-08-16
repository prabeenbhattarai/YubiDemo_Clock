import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminShell from "@/components/admin-shell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/worker");

  return <AdminShell user={user}>{children}</AdminShell>;
}
