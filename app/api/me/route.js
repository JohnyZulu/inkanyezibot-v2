// app/api/me/route.js — tells the dashboard who is signed in.
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ email: null }, { status: 401 });
  }
  const { email, name, image } = session.user;
  return Response.json({ email, name: name || null, image: image || null });
}
