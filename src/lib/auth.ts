import { betterAuth } from "better-auth";
import { getPool } from "@/lib/db";
import { APP_URL } from "@/lib/constants";

export const auth = betterAuth({
  database: getPool(),
  baseURL: process.env.BETTER_AUTH_URL || APP_URL,
  trustedOrigins: [APP_URL],
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
