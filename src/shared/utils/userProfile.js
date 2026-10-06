export function sanitizeUtenteProfile(row = {}) {
  if (!row) return null
  const {
    password_hash,
    auth_user_id,
    invite_token,
    invite_sent_at,
    reset_token,
    ...safe
  } = row
  return safe
}
