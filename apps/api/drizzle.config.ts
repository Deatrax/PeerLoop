import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
export default defineConfig({schema:'./db/schema.ts',out:'./db/migrations',dialect:'postgresql',dbCredentials:{url:process.env.DATABASE_URL??'postgresql://localhost/peerloop'}});
