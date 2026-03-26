import { auth } from "@/lib/auth";
import { ADMIN_EMAILS } from "@/lib/constants";

export async function requireAdmin(request: Request): Promise<{ authorized: true; email: string } | { authorized: false }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.email) return { authorized: false };
  if (!ADMIN_EMAILS.has(session.user.email)) return { authorized: false };
  return { authorized: true, email: session.user.email };
}
