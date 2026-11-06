import 'server-only';
import { anthropic } from '@ai-sdk/anthropic';

const DEFAULT_CLIENT_NOTES_MODEL = 'claude-sonnet-5-5';

/** True only when ENABLE_CLIENT_NOTES is exactly '1'. Server-only; no NEXT_PUBLIC mirror. */
export function isClientNotesEnabled(): boolean {
  return process.env['ENABLE_CLIENT_NOTES'] === '1';
}

/** Model id for client notes, overridable via CLIENT_NOTES_MODEL. */
export function getClientNotesModelId(): string {
  const configured = process.env['CLIENT_NOTES_MODEL']?.trim();
  return configured ? configured : DEFAULT_CLIENT_NOTES_MODEL;
}

/** Anthropic model for client notes. Throws a clear error if the API key is missing. */
export function getAnthropicModel() {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Client notes cannot call the model without it; ' +
        'set it in the server environment (never as a NEXT_PUBLIC_* variable).'
    );
  }
  return anthropic(getClientNotesModelId());
}
