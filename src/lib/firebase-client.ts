import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAoUANdApORH5BrvCUeRO9CgOuYDkhtRUQ",
  authDomain: "youdy-817c4.firebaseapp.com",
  projectId: "youdy-817c4",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
