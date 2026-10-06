import { useState } from 'react'
import { sb } from '../../lib/supabase'
import { isLocalAuthDisabled } from '../../lib/auth'

export function Login({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);
  
  const handleLogin=async(e)=>{
    e.preventDefault();
    if(!email||!password){setErr("Inserisci email e password");return;}
    setLoading(true);setErr(null);

    const bypass = isLocalAuthDisabled();

    if (bypass) {
      try {
        const { data, error } = await sb.from("utenti_studio")
          .select("id,nome,cognome,email,ruolo,permessi,clienti_assegnati,password_hash,auth_user_id")
          .eq("email", email.toLowerCase().trim())
          .eq("attivo", true)
          .single();
        
        if (error || !data) {
          setErr("Utente non trovato");
          setLoading(false);
          return;
        }
        if (data.password_hash !== password) {
          setErr("Password non corretta");
          setLoading(false);
          return;
        }

        const { password_hash, ...utenteSicuro } = data;
        onLogin({
          ...utenteSicuro,
          login_origin: 'dev_bypass'
        });
      } catch (errVal) {
        setErr("Errore di connessione");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await sb.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password
      });

      if (authError || !authData?.session) {
        setErr(authError?.message || "Email o password errati");
        setLoading(false);
        return;
      }

      const authUserId = authData.session.user.id;

      // 2. Retrieve utenti_studio profile using auth_user_id
      const { data: profileData, error: profileError } = await sb.from("utenti_studio")
        .select("id,nome,cognome,email,ruolo,permessi,clienti_assegnati,auth_user_id")
        .eq("auth_user_id", authUserId)
        .eq("attivo", true)
        .single();

      if (profileError || !profileData) {
        setErr("Profilo utente FiscoSim non trovato o disattivato");
        setLoading(false);
        return;
      }

      onLogin({
        ...profileData,
        login_origin: 'supabase_auth'
      });
    } catch (errVal) {
      setErr("Errore di connessione");
    } finally {
      setLoading(false);
    }
  };

  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)"}}>
      <div style={{width:"100%",maxWidth:380,padding:"0 1.25rem"}}>
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <div style={{width:52,height:52,background:"linear-gradient(135deg,var(--gold),var(--gld2))",borderRadius:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:"1.5rem",fontWeight:700,color:"#0d1117",marginBottom:"1rem"}}>§</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1.5rem",fontWeight:700,marginBottom:".25rem"}}>FiscoSim</div>
          <div style={{fontSize:".78rem",color:"var(--mu)"}}>Studio Envisioning · Accesso riservato</div>
        </div>
        <form onSubmit={handleLogin}>
          <div className="fg" style={{marginBottom:".75rem"}}>
            <label>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@studio.it" autoComplete="email" autoFocus/>
          </div>
          <div className="fg" style={{marginBottom:".75rem"}}>
            <label>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"/>
          </div>
          {err&&<div className="alert alert-err" style={{marginBottom:".75rem"}}>⚠️ {err}</div>}
          <button type="submit" className="btn full" disabled={loading} style={{marginTop:".5rem"}}>
            {loading?"⏳ Accesso...":"🔐 Accedi"}
          </button>
        </form>
        <div style={{fontSize:".65rem",color:"var(--mu)",textAlign:"center",marginTop:"1.5rem"}}>FiscoSim v3.0 · Studio Envisioning Srl<br/>Accesso solo per utenti autorizzati</div>
      </div>
    </div>
  );
}

