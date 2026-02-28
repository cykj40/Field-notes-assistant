import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env['DATABASE_URL'] || 'postgresql://placeholder';

export const sql = neon(databaseUrl);

export interface User {
  id: number;
  name: string;
  password_hash: string;
  role: 'admin' | 'supervisor';
  created_at: Date;
}
