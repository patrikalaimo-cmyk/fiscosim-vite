import { useState } from 'react'
import { signInWithPassword, fetchSessionProfile, signOutSession } from '../../lib/auth'

export function Login({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);
  
  const handleLogin=async(e)=>{
    e.preventDefault();
    if(!email||!password){setErr("Inserisci email e password");return;}
    setLoading(true);setErr(null);
    let sessionCreated = false;
    try {
      const { data: authData, error: authError } = await signInWithPassword(
        email.toLowerCase().trim(), password
      );
      if (authError || !authData?.session?.access_token) {
        throw new Error(authError?.message || "Email o password errati");
      }
      sessionCreated = true;
      const profile = await fetchSessionProfile(authData.session.access_token);
      if (!profile?.id || profile.attivo === false) {
        throw new Error("Profilo FiscoSim non disponibile o disattivato");
      }
      onLogin({...profile, login_origin: 'supabase_auth'});
    } catch (error) {
      if (sessionCreated) {
        await signOutSession().catch(() => null);
      }
      setErr(error?.message || "Autenticazione non riuscita");
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

