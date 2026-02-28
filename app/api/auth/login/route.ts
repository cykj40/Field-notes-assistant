import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { sql, User } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Guard: Check SESSION_SECRET is set
  if (!process.env['SESSION_SECRET']) {
    console.error('FATAL: SESSION_SECRET environment variable is not set');
    return NextResponse.json(
      { error: 'Server configuration error: SESSION_SECRET is not set' },
      { status: 500 }
    );
  }

  // Guard: Check DATABASE_URL is set
  if (!process.env['DATABASE_URL']) {
    console.error('FATAL: DATABASE_URL environment variable is not set');
    return NextResponse.json(
      { error: 'Server configuration error: DATABASE_URL is not set' },
      { status: 500 }
    );
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Query the user from the database
    const users = (await sql`
      SELECT id, name, password_hash, role, created_at
      FROM users
      WHERE name = ${username}
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const user = users[0];

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password using bcrypt
    const isValidPassword = await bcrypt.compare(password, user['password_hash'] as string);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Set session
    const session = await getSession();
    session.username = user['name'] as string;
    session.role = user['role'] as 'admin' | 'supervisor';
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({
      success: true,
      user: {
        name: user['name'],
        role: user['role'],
      },
    });
  } catch (error) {
    // Log the full error with message and stack trace
    console.error('Login error:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Log specific database errors
    if (error && typeof error === 'object' && 'code' in error) {
      console.error('Database error code:', error.code);
    }

    return NextResponse.json(
      {
        error: 'An error occurred during login',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
