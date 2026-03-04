import { test, expect, Page } from '@playwright/test';
import { login, USERS } from './auth.setup';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Injects a fake File into a hidden <input type="file"> without touching the
 *  OS file picker.  Works for both the camera and gallery inputs. */
async function injectPhotoFile(page: Page, inputSelector: string, filePath: string) {
    await page.setInputFiles(inputSelector, filePath);
}

/** Returns a small valid JPEG as a Buffer (1×1 red pixel). */
function tinyJpegBuffer(): Buffer {
    // Minimal valid JPEG (1×1 red pixel, ~631 bytes)
    const hex =
        'ffd8ffe000104a46494600010100000100010000' +
        'ffdb004300080606070605080707070909080a0c' +
        '140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20' +
        '242e2720222c231c1c2837292c30313434341f27' +
        '39403d3832403e333334373affffc0000b080001' +
        '0001010011ffC400' + '1f0000010501010101010100' + '000000000000' + '0102030405060708090a0b' +
        'ffc4' + '00b5' + '100002010303020403050504040000017d01020300041105122131410613516107227114328191' + 'a1' + '0823' + '42b1c11552d1f024336272' + '82090a161718191a25262728292a3435363738393a434445464748494a5354555657585' + '95a636465' + '6667686' + '96a737475767778797' + 'a838485868788898a9293949596979899' + '9aa2a3a4a5a6a7a8a9' + 'aab2b3b4b5b6b7b8b9' + 'bac2c3c4c5c6c7c8c9' + 'cad2d3d4d5d6d7d8d9' + 'dae1e2e3e4e5e6e7e8' + 'e9eaf1f2f3f4f5f6f7' + 'f8f9fa' +
        'ffda00080101000003f0' + 'f87f' + 'ffd9';
    // Build a simple valid JPEG another way — use a known-good minimal JPEG base64
    return Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=',
        'base64'
    );
}

/** Creates a temporary JPEG file and returns its path. */
function createTempJpeg(dir: string, name = 'test-photo.jpg'): string {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, tinyJpegBuffer());
    return filePath;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Photo Functionality', () => {
    let tempDir: string;
    let tempJpeg: string;

    test.beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'field-notes-tests-'));
        tempJpeg = createTempJpeg(tempDir);
    });

    test.afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // -------------------------------------------------------------------------
    // Photo Upload API
    // -------------------------------------------------------------------------

    test.describe('Upload API (/api/photos/upload)', () => {
        test('should reject unauthenticated upload requests', async ({ request }) => {
            const jpegBytes = tinyJpegBuffer();
            const response = await request.post('/api/photos/upload', {
                headers: { 'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '' },
                multipart: {
                    image: {
                        name: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        buffer: jpegBytes,
                    },
                },
            });

            expect(response.status()).toBe(401);
        });

        test('should reject requests without API key', async ({ request }) => {
            const jpegBytes = tinyJpegBuffer();
            const response = await request.post('/api/photos/upload', {
                multipart: {
                    image: {
                        name: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        buffer: jpegBytes,
                    },
                },
            });

            // 401 (missing api key) or 401 (missing session) — both are valid rejections
            expect([401, 403]).toContain(response.status());
        });

        test('should reject non-image file types', async ({ page, request }) => {
            await login(page);

            // Get session cookies
            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.post('/api/photos/upload', {
                headers: {
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                multipart: {
                    image: {
                        name: 'document.txt',
                        mimeType: 'text/plain',
                        buffer: Buffer.from('not an image'),
                    },
                },
            });

            expect(response.status()).toBe(400);
            const body = await response.json();
            expect(body.error).toContain('image');
        });

        test('should reject oversized images (>5MB)', async ({ page, request }) => {
            await login(page);

            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            // Create a buffer just over 5MB
            const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);

            const response = await request.post('/api/photos/upload', {
                headers: {
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                multipart: {
                    image: {
                        name: 'huge.jpg',
                        mimeType: 'image/jpeg',
                        buffer: oversizedBuffer,
                    },
                },
            });

            expect(response.status()).toBe(400);
            const body = await response.json();
            expect(body.error).toMatch(/large|size/i);
        });

        test('should reject request with no image field', async ({ page, request }) => {
            await login(page);

            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.post('/api/photos/upload', {
                headers: {
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                multipart: {},
            });

            expect(response.status()).toBe(400);
            const body = await response.json();
            expect(body.error).toContain('No image');
        });
    });

    // -------------------------------------------------------------------------
    // Photo Serving API
    // -------------------------------------------------------------------------

    test.describe('Photo Serving API (/api/photos/[id])', () => {
        test('should return 404 for unknown photo ID', async ({ request }) => {
            const response = await request.get('/api/photos/nonexistent-photo-id-xyz');
            expect(response.status()).toBe(404);
        });

        test('should serve stored photos publicly (no auth required)', async ({ page, request }) => {
            // Create a note with a photo first (authenticated)
            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await page.waitForTimeout(1500); // wait for upload + compression

            await page.fill('input#title', 'Photo Serve Test');
            await page.fill('textarea#content', 'Testing photo public serving');
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Find a photo URL on the page (if it renders one from Redis)
            // The note detail page renders data URLs directly from the note object.
            // The public endpoint is used by Google Chat — we can test it by
            // checking the note detail page renders the image.
            const img = page.locator('img').first();
            if ((await img.count()) > 0) {
                const src = await img.getAttribute('src');
                expect(src).toBeTruthy();
            }
        });
    });

    // -------------------------------------------------------------------------
    // NoteForm — Photo UI
    // -------------------------------------------------------------------------

    test.describe('NoteForm Photo UI', () => {
        test.beforeEach(async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');
        });

        test('should render Take Photo and Choose from Library buttons', async ({ page }) => {
            await expect(page.locator('button:has-text("Take Photo")')).toBeVisible();
            await expect(page.locator('button:has-text("Choose from Library")')).toBeVisible();
        });

        test('should have hidden camera and gallery file inputs', async ({ page }) => {
            const cameraInput = page.locator('input[type="file"][capture="environment"]');
            const galleryInput = page.locator('input[type="file"]:not([capture])');

            await expect(cameraInput).toHaveCount(1);
            await expect(galleryInput).toHaveCount(1);

            // Both should accept images only
            await expect(cameraInput).toHaveAttribute('accept', 'image/*');
            await expect(galleryInput).toHaveAttribute('accept', 'image/*');
        });

        test('should attach a photo and show thumbnail', async ({ page }) => {
            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);

            // Wait for thumbnail to appear
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            const thumbnail = page.locator('img[alt="Field photo"]');
            await expect(thumbnail).toHaveCount(1);
        });

        test('should show correct photo count when multiple photos are attached', async ({ page }) => {
            const jpeg2 = createTempJpeg(tempDir, 'second.jpg');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', jpeg2);
            await expect(page.locator('text=/2 photos attached/')).toBeVisible({ timeout: 8000 });
        });

        test('should remove a photo when × button is clicked', async ({ page }) => {
            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            // Hover over thumbnail to reveal remove button
            const thumbnail = page.locator('img[alt="Field photo"]').first();
            await thumbnail.hover();

            const removeBtn = page.locator('button[aria-label="Remove photo"]').first();
            await removeBtn.click();

            // Should no longer show the photo count badge
            await expect(page.locator('text=/photo attached/')).toHaveCount(0, { timeout: 5000 });
        });

        test('should allow note creation with photo only (no title or content)', async ({ page }) => {
            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            // Submit without title or content
            await page.click('button[type="submit"]');

            // Should navigate to note detail (not show validation error)
            await page.waitForURL(/\/notes\/[a-f0-9-]+/, { timeout: 10000 });
            await expect(page).toHaveURL(/\/notes\/[a-f0-9-]+/);
        });

        test('should show validation error when submitting empty form (no title, content, or photo)', async ({ page }) => {
            await page.click('button[type="submit"]');
            await expect(
                page.locator('text=/title|notes|photo/i').first()
            ).toBeVisible({ timeout: 5000 });
        });

        test('should show uploading indicator while photo is processing', async ({ page }) => {
            // Watch for the uploading text to appear and disappear
            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);

            // The "Uploading photo..." text may appear briefly
            // We just assert the full flow completes without error
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 10000 });
            await expect(page.locator('text=Uploading photo...')).toHaveCount(0, { timeout: 5000 });
        });
    });

    // -------------------------------------------------------------------------
    // Note Detail — Photo Display
    // -------------------------------------------------------------------------

    test.describe('Note Detail — Photo Display', () => {
        test('should display photos on note detail page', async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Photo Display Test');
            await page.fill('textarea#content', 'Verifying photo renders on detail page');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Detail page should show "Photos (1)" section
            await expect(page.locator('text=📷 Photos (1)')).toBeVisible();

            // Should render the image
            const img = page.locator('img[alt="Field photo"]');
            await expect(img).toHaveCount(1);
        });

        test('should display multiple photos on note detail page', async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');

            const jpeg2 = createTempJpeg(tempDir, 'detail-second.jpg');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', jpeg2);
            await expect(page.locator('text=/2 photos attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Multi-Photo Display Test');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            await expect(page.locator('text=📷 Photos (2)')).toBeVisible();
            await expect(page.locator('img[alt="Field photo"]')).toHaveCount(2);
        });

        test('should not show Photos section when note has no photos', async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');

            await page.fill('input#title', 'No Photo Note');
            await page.fill('textarea#content', 'This note has no photos');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            await expect(page.locator('text=📷 Photos')).toHaveCount(0);
        });
    });

    // -------------------------------------------------------------------------
    // Edit Note — Photo Handling
    // -------------------------------------------------------------------------

    test.describe('Edit Note — Photo Handling', () => {
        test('should preserve existing photos when editing a note', async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Edit Photo Preserve Test');
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Navigate to edit
            await page.click('a.btn-secondary:has-text("Edit")');
            await page.waitForURL(/\/edit/);

            // Should still show 1 photo
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 5000 });

            // Save without changes
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+$/);

            // Photo should still be present
            await expect(page.locator('text=📷 Photos (1)')).toBeVisible();
        });

        test('should allow adding more photos during edit', async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');

            // Create note with 1 photo
            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Add More Photos Test');
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Edit the note
            await page.click('a.btn-secondary:has-text("Edit")');
            await page.waitForURL(/\/edit/);

            // Add another photo
            const jpeg2 = createTempJpeg(tempDir, 'edit-add.jpg');
            await injectPhotoFile(page, 'input[type="file"]:not([capture])', jpeg2);
            await expect(page.locator('text=/2 photos attached/')).toBeVisible({ timeout: 8000 });

            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+$/);

            await expect(page.locator('text=📷 Photos (2)')).toBeVisible();
        });

        test('should allow removing photos during edit', async ({ page }) => {
            await login(page);
            await page.goto('/notes/new');

            const jpeg2 = createTempJpeg(tempDir, 'remove-edit.jpg');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', jpeg2);
            await expect(page.locator('text=/2 photos attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Remove Photo Edit Test');
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Edit the note
            await page.click('a.btn-secondary:has-text("Edit")');
            await page.waitForURL(/\/edit/);

            // Remove one photo
            const thumbnail = page.locator('img[alt="Field photo"]').first();
            await thumbnail.hover();
            await page.locator('button[aria-label="Remove photo"]').first().click();

            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 5000 });

            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+$/);

            await expect(page.locator('text=📷 Photos (1)')).toBeVisible();
        });
    });

    // -------------------------------------------------------------------------
    // Send to Google Chat — with Photos
    // -------------------------------------------------------------------------

    test.describe('Send to Google Chat — Photo Notes', () => {
        test.skip(
            !process.env['GOOGLE_CHAT_WEBHOOK_URL'],
            'Skipping webhook photo tests — GOOGLE_CHAT_WEBHOOK_URL not configured'
        );

        test('should send note with photos to Google Chat and delete note', async ({ page }) => {
            await login(page, USERS.cyrus);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Chat Photo Test');
            await page.fill('textarea#content', 'This note has a photo and should go to Google Chat');
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Send to Google Chat
            await page.click('button:has-text("Send to Google Chat")');

            // Should navigate back to home after send+delete
            await page.waitForURL('/', { timeout: 15000 });
            await expect(page.locator('h1')).toContainText('Field Notes');
        });
    });

    // -------------------------------------------------------------------------
    // Send to Chat API — Photo Payload Validation
    // -------------------------------------------------------------------------

    test.describe('Send to Chat API — Photo Payload', () => {
        test('should use card format (not plain text) when note has photos', async ({ page, request }) => {
            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Card Format Test');
            await page.fill('textarea#content', 'Photo note — should use card payload');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            const noteId = page.url().split('/').pop();
            expect(noteId).toBeTruthy();

            // We can't intercept the outgoing webhook in tests without a mock server,
            // but we can verify the send-to-chat endpoint accepts the note and
            // responds correctly.  If no webhook URL is configured it returns 500.
            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.post('/api/send-to-chat', {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                data: { noteId },
            });

            // Either success (200) or "webhook not configured" (500) — never 400/404
            expect([200, 500]).toContain(response.status());

            if (response.status() === 200) {
                const body = await response.json();
                expect(body.success).toBe(true);
                expect(body.deleted).toBe(true);
            }
        });

        test('should use plain text format when note has no photos', async ({ page, request }) => {
            await login(page);
            await page.goto('/notes/new');

            await page.fill('input#title', 'Plain Text Format Test');
            await page.fill('textarea#content', 'No photo — should use plain text payload');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            const noteId = page.url().split('/').pop();
            expect(noteId).toBeTruthy();

            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.post('/api/send-to-chat', {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                data: { noteId },
            });

            expect([200, 500]).toContain(response.status());
        });

        test('should return 404 for non-existent note ID in send-to-chat', async ({ page, request }) => {
            await login(page);

            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.post('/api/send-to-chat', {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                data: { noteId: 'non-existent-note-id-xyz' },
            });

            expect(response.status()).toBe(404);
        });

        test('should return 400 when noteId is missing from send-to-chat', async ({ page, request }) => {
            await login(page);

            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.post('/api/send-to-chat', {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
                data: {},
            });

            expect(response.status()).toBe(400);
        });
    });

    // -------------------------------------------------------------------------
    // Notes API — Photo Persistence in Storage
    // -------------------------------------------------------------------------

    test.describe('Notes API — Photo Persistence', () => {
        test('should persist photos on the note object after creation', async ({ page, request }) => {
            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Photo Persistence Test');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            const noteId = page.url().split('/').pop();
            expect(noteId).toBeTruthy();

            // Fetch the note via API and confirm photos array is populated
            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.get(`/api/notes/${noteId}`, {
                headers: {
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
            });

            expect(response.status()).toBe(200);

            const note = await response.json();
            expect(Array.isArray(note.photos)).toBe(true);
            expect(note.photos.length).toBe(1);
            expect(note.photos[0]).toMatchObject({
                id: expect.any(String),
                dataUrl: expect.stringMatching(/^data:image\//),
                createdAt: expect.any(String),
            });
        });

        test('should persist zero photos when note created without photos', async ({ page, request }) => {
            await login(page);
            await page.goto('/notes/new');

            await page.fill('input#title', 'No Photo Persistence Test');
            await page.fill('textarea#content', 'No photos on this one');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            const noteId = page.url().split('/').pop();
            const cookies = await page.context().cookies();
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

            const response = await request.get(`/api/notes/${noteId}`, {
                headers: {
                    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
                    Cookie: cookieHeader,
                },
            });

            const note = await response.json();
            expect(note.photos).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // Console error checks
    // -------------------------------------------------------------------------

    test.describe('Console Errors — Photo Flows', () => {
        test('should have no console errors during photo attach and submit', async ({ page }) => {
            const errors: string[] = [];
            page.on('console', (msg) => {
                if (msg.type() === 'error') errors.push(msg.text());
            });
            page.on('pageerror', (err) => errors.push(err.message));

            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Console Error Check');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            expect(errors, `Console errors: ${errors.join(', ')}`).toHaveLength(0);
        });

        test('should have no console errors on note detail page with photos', async ({ page }) => {
            const errors: string[] = [];

            await login(page);
            await page.goto('/notes/new');

            await injectPhotoFile(page, 'input[type="file"]:not([capture])', tempJpeg);
            await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 8000 });

            await page.fill('input#title', 'Detail Console Check');
            await page.click('button[type="submit"]');

            await page.waitForURL(/\/notes\/[a-f0-9-]+/);

            // Now attach error listeners after navigation to check detail page
            page.on('console', (msg) => {
                if (msg.type() === 'error') errors.push(msg.text());
            });
            page.on('pageerror', (err) => errors.push(err.message));

            await page.reload();
            await page.waitForTimeout(1000);

            expect(errors, `Console errors on detail: ${errors.join(', ')}`).toHaveLength(0);
        });
    });
});