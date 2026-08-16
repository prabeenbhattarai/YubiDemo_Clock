import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(user.role === "admin" ? "/admin" : "/worker");
}
