import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import WorkerShell from "@/components/worker-shell";

export default async function WorkerLayout({ children }: LayoutProps<"/worker">) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "worker") redirect("/admin");

  return <WorkerShell user={user}>{children}</WorkerShell>;
}
