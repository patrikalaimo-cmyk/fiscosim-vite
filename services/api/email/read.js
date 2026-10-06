export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  maxDuration: 60
};

/**
 * Phase A hardening:
 * - Email read is temporarily disabled to keep deploy safe.
 * - Previous IMAP implementation depended on extra packages and had hardcoded credentials.
 * - We keep this handler as a controlled stub to avoid crashes and accidental exposure.
 */
export async function emailReadHandler() {
  return {
    status: 503,
    json: {
      ok: false,
      error: 'EMAIL_READ_DISABLED',
      message: 'Email read temporarily disabled during Phase A hardening'
    }
  };
}

