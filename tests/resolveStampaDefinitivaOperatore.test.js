import { test } from 'node:test';
import assert from 'node:assert';
import { sb } from '../src/lib/supabase.js';
import { resolveStampaDefinitivaOperatore } from '../src/modules/contabilita/application/stampe/resolveStampaDefinitivaOperatore.js';

test('resolveStampaDefinitivaOperatore risolve correttamente utente_studio.id', async () => {
  const originalGetSession = sb.auth.getSession;
  const originalFrom = sb.from;

  sb.auth.getSession = async () => ({
    data: {
      session: {
        user: {
          id: 'auth-user-123',
          email: 'test@example.com'
        }
      }
    }
  });

  sb.from = (table) => {
    assert.strictEqual(table, 'utenti_studio');
    return {
      select: () => ({
        eq: (col, val) => {
          if (col === 'auth_user_id') {
            assert.strictEqual(val, 'auth-user-123');
          }
          return {
            eq: (col2, val2) => {
              assert.strictEqual(col2, 'attivo');
              assert.strictEqual(val2, true);
              return {
                maybeSingle: async () => ({
                  data: { id: 'utenti-studio-uuid-456' },
                  error: null
                })
              };
            }
          };
        }
      })
    };
  };

  try {
    const result = await resolveStampaDefinitivaOperatore();
    assert.strictEqual(result, 'utenti-studio-uuid-456');
  } finally {
    sb.auth.getSession = originalGetSession;
    sb.from = originalFrom;
  }
});

test('resolveStampaDefinitivaOperatore fallback su email se auth_user_id non trova nulla', async () => {
  const originalGetSession = sb.auth.getSession;
  const originalFrom = sb.from;

  sb.auth.getSession = async () => ({
    data: {
      session: {
        user: {
          id: 'auth-user-123',
          email: 'test@example.com'
        }
      }
    }
  });

  let queryCount = 0;
  sb.from = (table) => {
    assert.strictEqual(table, 'utenti_studio');
    return {
      select: () => ({
        eq: (col, val) => {
          queryCount++;
          if (queryCount === 1) {
            assert.strictEqual(col, 'auth_user_id');
            assert.strictEqual(val, 'auth-user-123');
          } else {
            assert.strictEqual(col, 'email');
            assert.strictEqual(val, 'test@example.com');
          }
          return {
            eq: (col2, val2) => {
              assert.strictEqual(col2, 'attivo');
              assert.strictEqual(val2, true);
              return {
                maybeSingle: async () => {
                  if (queryCount === 1) {
                    return { data: null, error: null };
                  } else {
                    return { data: { id: 'utenti-studio-uuid-fallback' }, error: null };
                  }
                }
              };
            }
          };
        }
      })
    };
  };

  try {
    const result = await resolveStampaDefinitivaOperatore();
    assert.strictEqual(result, 'utenti-studio-uuid-fallback');
    assert.strictEqual(queryCount, 2);
  } finally {
    sb.auth.getSession = originalGetSession;
    sb.from = originalFrom;
  }
});

test('resolveStampaDefinitivaOperatore solleva errore se non risolto', async () => {
  const originalGetSession = sb.auth.getSession;
  const originalFrom = sb.from;

  sb.auth.getSession = async () => ({
    data: {
      session: null
    }
  });

  try {
    await assert.rejects(
      resolveStampaDefinitivaOperatore(),
      /Operatore studio non risolto: impossibile consolidare stampa definitiva/
    );
  } finally {
    sb.auth.getSession = originalGetSession;
    sb.from = originalFrom;
  }
});
