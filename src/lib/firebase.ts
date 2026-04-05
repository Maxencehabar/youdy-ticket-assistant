import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

if (!admin.apps.length) {
  const localKeyPath = join(process.cwd(), "accountKeyProd.json");

  if (existsSync(localKeyPath)) {
    // Local dev: use JSON file
    const serviceAccount = JSON.parse(readFileSync(localKeyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Vercel: use env vars
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

export const db = admin.firestore();
