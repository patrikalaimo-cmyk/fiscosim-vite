import { sb } from '../../../../lib/supabase.js';

/**
 * Risolve l'id dell'operatore dallo schema utenti_studio (public.utenti_studio.id)
 * associato all'utente loggato in sessione (auth.users.id).
 * Se non risolto, restituisce un errore bloccante.
 * @returns {Promise<string>}
 */
export async function resolveStampaDefinitivaOperatore() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user?.id) {
      const { data: profile } = await sb.from('utenti_studio')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .eq('attivo', true)
        .maybeSingle();
        
      if (profile?.id) {
        return profile.id;
      }
      
      // Fallback controllato su email
      if (session.user.email) {
        const { data: fallbackProfile } = await sb.from('utenti_studio')
          .select('id')
          .eq('email', session.user.email)
          .eq('attivo', true)
          .maybeSingle();
          
        if (fallbackProfile?.id) {
          return fallbackProfile.id;
        }
      }
    }
  } catch (e) {
    console.warn('[resolveStampaDefinitivaOperatore] failed to fetch active session:', e);
  }
  
  throw new Error('Operatore studio non risolto: impossibile consolidare stampa definitiva.');
}
