import { betterAuth } from "better-auth";
import { getPool } from "@/lib/db";

export const auth = betterAuth({
  database: getPool(),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
});
