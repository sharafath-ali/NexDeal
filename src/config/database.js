import 'dotenv/config';

import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// In development, route Neon serverless driver traffic through the local proxy.
// NEON_LOCAL_HOST defaults to "neon-local" (the Docker Compose service name).
// If you run Neon Local standalone via `docker run -p 5432:5432`, set
// NEON_LOCAL_HOST=localhost in your shell before starting the app.
if (process.env.NODE_ENV === 'development') {
  const neonLocalHost = process.env.NEON_LOCAL_HOST ?? 'neon-local';
  neonConfig.fetchEndpoint = `http://${neonLocalHost}:5432/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}

const sql = neon(process.env.DATABASE_URL);

const db = drizzle(sql);

export { db, sql };
