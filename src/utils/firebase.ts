import admin from "firebase-admin";
import config from "../config";

if (!admin.apps.length) {
  if (!config.firebase.projectId || !config.firebase.clientEmail || !config.firebase.privateKey) {
    console.warn("Firebase config is incomplete. Firebase features will be disabled.");
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
  }
}

export async function generateFirebasePasswordResetLink(email: string): Promise<string> {
  if (!admin.apps.length) {
    throw new Error("Firebase is not initialized");
  }

  return admin.auth().generatePasswordResetLink(email);
}
