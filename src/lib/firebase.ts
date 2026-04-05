import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    readFileSync(join(process.cwd(), "accountKeyProd.json"), "utf-8")
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
