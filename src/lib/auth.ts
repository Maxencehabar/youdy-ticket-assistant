import admin from "firebase-admin";

const ALLOWED_EMAILS = [
  "contact@youdy.fr",
  "maxencehabar@gmail.com",
];

export async function verifyAuth(req: Request): Promise<{ email: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.split("Bearer ")[1];
  if (!token) return null;

  try {
    // Ensure firebase-admin is initialized (imported from firebase.ts)
    await import("./firebase");

    const decoded = await admin.auth().verifyIdToken(token);
    if (!decoded.email) return null;
    if (!ALLOWED_EMAILS.includes(decoded.email)) return null;

    return { email: decoded.email };
  } catch {
    return null;
  }
}
