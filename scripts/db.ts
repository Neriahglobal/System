import { config } from "dotenv";
import { Client } from "pg";

// Load .env.local (falls back to .env).
config({ path: ".env.local" });
config();

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (Supabase > Project Settings > Database > Connection string).",
    );
  }
  return url;
}

export function createDbClient(): Client {
  return new Client({
    connectionString: requireDatabaseUrl(),
    // Supabase requires TLS; the pooled/direct hosts use certs Node may not
    // have in its trust store, so relax verification for this admin script.
    ssl: { rejectUnauthorized: false },
  });
}
