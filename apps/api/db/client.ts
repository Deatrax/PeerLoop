import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
let connection: ReturnType<typeof drizzle> | undefined;
export function database(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required. Configure Postgres, or use the explicit offline demo in the app.');return connection ??= drizzle(postgres(process.env.DATABASE_URL,{max:5,prepare:false,idle_timeout:20,connect_timeout:10}));}
