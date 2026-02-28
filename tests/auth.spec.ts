import { test, expect } from '@playwright/test';
import { USERS, login, logout } from './auth.setup';

test.describe('Authentication System', () => {
  test.describe('Login Flow', () => {
    test('should login successfully with valid Cyrus credentials', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', USERS.cyrus.username);
      await page.fill('input#password', USERS.cyrus.password);
      await page.click('button[type="submit"]');

      // Should redirect to home page
      await expect(page).toHaveURL('/');
      await expect(page.locator('h1')).toContainText('Field Notes');
    });

    test('should show error with invalid password', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', USERS.cyrus.username);
      await page.fill('input#password', 'wrongpassword123');
      await page.click('button[type="submit"]');

      // Should stay on login page
      await expect(page).toHaveURL('/login');

      // Should show generic error
      await expect(page.locator('text=Invalid credentials')).toBeVisible();
    });

    test('should show error with invalid username', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', 'NonExistentUser');
      await page.fill('input#password', 'anypassword');
      await page.click('button[type="submit"]');

      // Should stay on login page
      await expect(page).toHaveURL('/login');

      // Should show generic error
      await expect(page.locator('text=Invalid credentials')).toBeVisible();
    });

    test('should handle empty form submission', async ({ page }) => {
      await page.goto('/login');
      await page.click('button[type="submit"]');

      // HTML5 validation should prevent submission or show error
      // The form should still be on the login page
      await expect(page).toHaveURL('/login');
    });

    test('should not have sign up link or registration path', async ({ page }) => {
      await page.goto('/login');

      // Check that there's no sign up link
      const signUpLink = page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Create account")');
      await expect(signUpLink).toHaveCount(0);

      // Try accessing a hypothetical signup route
      const response = await page.goto('/signup');
      // Should redirect to login or show 404
      await expect(page).not.toHaveURL('/signup');
    });

    test('should not show password in plain text', async ({ page }) => {
      await page.goto('/login');
      const passwordInput = page.locator('input#password');

      await expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test.describe('Session Management', () => {
    test('should access protected routes after login', async ({ page }) => {
      await login(page);

      // Should be able to access home
      await page.goto('/');
      await expect(page).toHaveURL('/');

      // Should be able to access new note page
      await page.goto('/notes/new');
      await expect(page).toHaveURL('/notes/new');
    });

    test('should redirect to login when accessing protected route without session', async ({ page }) => {
      // Try to access home without logging in
      await page.goto('/');
      await expect(page).toHaveURL('/login');

      // Try to access new note page without logging in
      await page.goto('/notes/new');
      await expect(page).toHaveURL('/login');
    });

    test('should redirect to login after logout', async ({ page }) => {
      // Login first
      await login(page);
      await expect(page).toHaveURL('/');

      // Logout by clearing cookies
      await logout(page);

      // Try to access protected route
      await page.goto('/');
      await expect(page).toHaveURL('/login');
    });

    test('should persist session across page reloads', async ({ page }) => {
      await login(page);
      await expect(page).toHaveURL('/');

      // Reload the page
      await page.reload();

      // Should still be authenticated
      await expect(page).toHaveURL('/');
      await expect(page.locator('h1')).toContainText('Field Notes');
    });
  });

  test.describe('Multi-User Support', () => {
    test('should login as Cyrus', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', USERS.cyrus.username);
      await page.fill('input#password', USERS.cyrus.password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL('/');
    });

    test('should login as Brianna', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', USERS.brianna.username);
      await page.fill('input#password', USERS.brianna.password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL('/');
    });

    test('should login as Victor', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', USERS.victor.username);
      await page.fill('input#password', USERS.victor.password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL('/');
    });

    test('should login as Scott', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#username', USERS.scott.username);
      await page.fill('input#password', USERS.scott.password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL('/');
    });

    test('should display correct username for Cyrus', async ({ page }) => {
      await login(page, USERS.cyrus);

      // Create a note to see the creator name
      await page.goto('/notes/new');
      await page.fill('input#title', 'Cyrus Test Note');
      await page.fill('textarea#content', 'Testing creator attribution');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Check that Cyrus is shown as creator
      await expect(page.locator('text=Created by: Cyrus')).toBeVisible();
    });

    test('should display correct username for Brianna', async ({ page }) => {
      await login(page, USERS.brianna);

      // Create a note to see the creator name
      await page.goto('/notes/new');
      await page.fill('input#title', 'Brianna Test Note');
      await page.fill('textarea#content', 'Testing creator attribution');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Check that Brianna is shown as creator
      await expect(page.locator('text=Created by: Brianna')).toBeVisible();
    });

    test('should display correct username for Victor', async ({ page }) => {
      await login(page, USERS.victor);

      // Create a note to see the creator name
      await page.goto('/notes/new');
      await page.fill('input#title', 'Victor Test Note');
      await page.fill('textarea#content', 'Testing creator attribution');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Check that Victor is shown as creator
      await expect(page.locator('text=Created by: Victor')).toBeVisible();
    });

    test('should display correct username for Scott', async ({ page }) => {
      await login(page, USERS.scott);

      // Create a note to see the creator name
      await page.goto('/notes/new');
      await page.fill('input#title', 'Scott Test Note');
      await page.fill('textarea#content', 'Testing creator attribution');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Check that Scott is shown as creator
      await expect(page.locator('text=Created by: Scott')).toBeVisible();
    });
  });
});
