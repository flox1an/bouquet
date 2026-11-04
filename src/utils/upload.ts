import type { AxiosError } from 'axios';
// Browsers hide error responses that lack CORS headers (e.g. blossom.primal.net), so status and reason are unreadable.
const CORS_MASKED_ERROR = 'Network error: server unreachable or response blocked by CORS (see browser DevTools → Network)';

/**
 * Formats an axios upload error into a human-readable message, surfacing the
 * HTTP status and any server-provided message.
 */
export function formatUploadError(error: AxiosError): string {
  const status = error.response?.status;
  const response = error.response?.data as { message?: string } | undefined;
  const responseMessage = response?.message;

  if (status === 403) return `Forbidden (403)${responseMessage ? `: ${responseMessage}` : ''}`;
  if (status === 401) return `Unauthorized (401)${responseMessage ? `: ${responseMessage}` : ''}`;
  if (status === 404) return `Not found (404)${responseMessage ? `: ${responseMessage}` : ''}`;
  if (status && status >= 500) return `Server error (${status})${responseMessage ? `: ${responseMessage}` : ''}`;
  if (!error.response && error.code === 'ERR_NETWORK') return CORS_MASKED_ERROR;

  return responseMessage ? `${error.message}: ${responseMessage}` : error.message;
}

export function formatTransferError(error: unknown, sourceServer: string): string {
  const value = error as {
    name?: string;
    message?: string;
    code?: string;
    response?: { status?: number };
  };
  const status = value.response?.status;
  if (value.message?.includes('cancelled')) return 'Transfer cancelled';
  if (value.message?.includes('timeout')) return 'Operation timed out';
  if (value.name === 'SourceBlobNotFoundError') return `Missing on source server (${sourceServer})`;
  if (status === 404) return 'File not found (404)';
  if (status === 401 || status === 403) return 'Authentication failed';
  if (status && status >= 500) return `Server error (${status})`;
  if (value.code === 'ECONNRESET' || value.code === 'ETIMEDOUT') return 'Network error';
  if (!value.response && value.code === 'ERR_NETWORK') return CORS_MASKED_ERROR;
  return value.message ?? 'Unknown error';
}
