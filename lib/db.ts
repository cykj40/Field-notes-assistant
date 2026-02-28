import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set. Cannot initialize database connection.');
}

export const sql = neon(databaseUrl);

export interface User {
  id: number;
  name: string;
  password_hash: string;
  role: 'admin' | 'supervisor';
  created_at: Date;
}
