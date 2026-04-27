// /lib/firebase.ts
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

// 1. Initialize Firebase Admin (Singleton)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Safely handle the private key formatting, accounting for undefined in strict mode
            privateKey: process.env.FIREBASE_PRIVATE_KEY
                ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                : undefined,
        }),
    });
}

// 2. Export the base admin instance in case you need Firestore, Storage, etc. later
export const firebaseAdmin = admin;

// 3. Export the "hot" Auth instance
export const auth = getAuth();