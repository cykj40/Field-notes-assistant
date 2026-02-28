import { neon } from '@neondatabase/serverless';
import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

async function seedUsers() {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const sql = neon(databaseUrl);

  console.log('Creating users table if it doesn\'t exist...');

  // Create the users table
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor')),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  console.log('Users table ready.');

  // Read passwords from environment variables
  const cyrusPassword = process.env['CYRUS_PASSWORD'];
  const briannaPassword = process.env['BRIANNA_PASSWORD'];
  const victorPassword = process.env['VICTOR_PASSWORD'];
  const scottPassword = process.env['SCOTT_PASSWORD'];

  if (!cyrusPassword || !briannaPassword || !victorPassword || !scottPassword) {
    throw new Error(
      'Missing password environment variables. Required: CYRUS_PASSWORD, BRIANNA_PASSWORD, VICTOR_PASSWORD, SCOTT_PASSWORD'
    );
  }

  console.log('Hashing passwords...');

  // Hash all passwords
  const [cyrusHash, briannaHash, victorHash, scottHash] = await Promise.all([
    bcrypt.hash(cyrusPassword, SALT_ROUNDS),
    bcrypt.hash(briannaPassword, SALT_ROUNDS),
    bcrypt.hash(victorPassword, SALT_ROUNDS),
    bcrypt.hash(scottPassword, SALT_ROUNDS),
  ]);

  console.log('Upserting users...');

  // Define the users
  const users = [
    { name: 'Cyrus', passwordHash: cyrusHash, role: 'admin' },
    { name: 'Brianna', passwordHash: briannaHash, role: 'supervisor' },
    { name: 'Victor', passwordHash: victorHash, role: 'supervisor' },
    { name: 'Scott', passwordHash: scottHash, role: 'supervisor' },
  ];

  // Upsert each user (insert or update on conflict)
  for (const user of users) {
    await sql`
      INSERT INTO users (name, password_hash, role)
      VALUES (${user.name}, ${user.passwordHash}, ${user.role})
      ON CONFLICT (name)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
    `;
    console.log(`✓ Upserted user: ${user.name} (${user.role})`);
  }

  console.log('\n✅ All users seeded successfully!');
  console.log('Users in database:');
  console.log('  - Cyrus (admin)');
  console.log('  - Brianna (supervisor)');
  console.log('  - Victor (supervisor)');
  console.log('  - Scott (supervisor)');
}

seedUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  });
