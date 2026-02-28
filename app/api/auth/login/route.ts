import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { sql, User } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
