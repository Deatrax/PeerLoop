import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
export function database(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required. Configure Postgres, or use the explicit offline demo in the app.');return drizzle(postgres(process.env.DATABASE_URL,{max:1,prepare:false,idle_timeout:20,connect_timeout:10}));}
