# Playwright Test Suite

This directory contains end-to-end tests for the Field Notes application using Playwright.

## Prerequisites

Before running the tests, you must set up the following:

### 1. Environment Variables

The tests require user passwords to be set in your `.env.local` file. These are the same passwords used by the application's authentication system.

Add these to your `.env.local`:

```bash
# User Passwords (required for tests)
CYRUS_PASSWORD=your-secure-password-for-cyrus
BRIANNA_PASSWORD=your-secure-password-for-brianna
VICTOR_PASSWORD=your-secure-password-for-victor
SCOTT_PASSWORD=your-secure-password-for-scott

# Database (required for auth tests)
DATABASE_URL=postgresql://your-neon-connection-string

# Session Secret (required)
SESSION_SECRET=your-32-char-min-secret

# Redis (required for note storage)
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token

# API Key (required)
FIELD_NOTES_API_KEY=your-api-key
NEXT_PUBLIC_FIELD_NOTES_API_KEY=your-api-key

# Google Chat (optional - webhook tests will skip if not set)
GOOGLE_CHAT_WEBHOOK_URL=your-webhook-url
```

### 2. Database Setup

The authentication tests require the users table to exist in your Neon Postgres database.

**Run the seed script once:**

```bash
npm run seed-users
```

This will create the `users` table and insert the 4 users (Cyrus, Brianna, Victor, Scott) with hashed passwords from your environment variables.

### 3. Development Server

The tests will automatically start a development server, but you can also run it manually:

```bash
npm run dev
```

## Running Tests

### Run all tests

```bash
npm test
```

### Run specific test file

```bash
npx playwright test tests/auth.spec.ts
```

### Run with UI mode

```bash
npx playwright test --ui
```

### Run in headed mode (see browser)

```bash
npx playwright test --headed
```

## Test Structure

### Test Files

- **`auth.spec.ts`** - Authentication system tests
  - Login flow (valid/invalid credentials)
  - Session management
  - Multi-user support

- **`note-authorship.spec.ts`** - Note attribution and timestamp tests
  - Creator attribution for each user
  - Timestamp format verification
  - Anonymous note blocking
  - Legacy data handling

- **`google-chat-webhook.spec.ts`** - Webhook integration tests
  - Creator and timestamp in webhook messages
  - Multi-user webhook formatting

- **`authenticated.spec.ts`** - General app functionality tests
  - Note CRUD operations
  - Navigation
  - PWA features

- **`unauthenticated.spec.ts`** - Public access tests
  - Redirect behavior
  - Login page access

### Test Helpers

- **`auth.setup.ts`** - Authentication helper functions
  - `login(page, credentials?)` - Log in as a user
  - `logout(page)` - Clear session
  - `USERS` - User credentials from environment

- **`global.setup.ts`** - Global test setup
  - Creates authenticated browser contexts for each user
  - Saves storage states in `tests/.auth/` directory

## Authenticated Session Fixtures

The test suite uses Playwright's storage state feature to avoid logging in for every test. During the global setup phase, authenticated sessions are created for each user and saved to JSON files.

These storage states are automatically loaded for tests that need authentication, significantly speeding up test execution.

### Projects

Tests can run against different authenticated contexts:

- `chromium` - Unauthenticated context
- `chromium-cyrus` - Authenticated as Cyrus
- `chromium-brianna` - Authenticated as Brianna
- `chromium-victor` - Authenticated as Victor
- `chromium-scott` - Authenticated as Scott

## Troubleshooting

### "No password set for [User]" warnings

This means the environment variable for that user's password is not set in `.env.local`. Add the missing password variables.

### "relation 'users' does not exist" errors

Run the seed script to create the database table:

```bash
npm run seed-users
```

### Tests timing out

Increase the timeout in `playwright.config.ts` or run with more workers if your system can handle it.

### Storage state files not created

Check that:
1. All user passwords are set in `.env.local`
2. The database is seeded with users
3. The dev server is running and accessible at `http://localhost:3000`

## CI/CD

In CI environments, ensure all environment variables are set as secrets/environment variables in your CI platform. The tests will automatically:

- Run with retries (2 retries in CI)
- Not reuse existing dev server
- Generate HTML reports

## Coverage

The test suite covers:

- ✅ Login with valid credentials (all 4 users)
- ✅ Login with invalid credentials (password and username)
- ✅ Empty form validation
- ✅ No sign-up path verification
- ✅ Session persistence across reloads
- ✅ Protected route access control
- ✅ Logout and session clearing
- ✅ Note creation with user attribution
- ✅ Timestamp format validation
- ✅ Creator display in UI (cards and detail views)
- ✅ Anonymous note creation blocking
- ✅ Legacy data null handling
- ✅ Multi-user note ownership
- ✅ Google Chat webhook formatting (if configured)
- ✅ CRUD operations (create, read, update, delete notes)
- ✅ Navigation and routing
- ✅ PWA manifest and features
- ✅ Console error detection
