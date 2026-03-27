import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function initializeDatabase() {
  try {
    await pool.query("SELECT NOW()");
    console.log("✓ Database connection established");
  } catch (error) {
    console.error("✗ Database connection failed:", error);
    process.exit(1);
  }
}

export { pool };
