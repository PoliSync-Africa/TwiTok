"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const WEB_TOKEN_KEY = "twitok_web_session";
const WEB_VERIFICATION_KEY = "twitok_web_verification";
type Mode = "login" | "signup";
type Step = "credentials" | "verify" | "profile";

const countries = [
  ["GH","Ghana"],["NG","Nigeria"],["KE","Kenya"],["ZA","South Africa"],["UG","Uganda"],["TZ","Tanzania"],["RW","Rwanda"],["SN","Senegal"],
  ["CI","Côte d'Ivoire"],["CM","Cameroon"],["BI","Burundi"],["ET","Ethiopia"],["EG","Egypt"],["MA","Morocco"],["DZ","Algeria"],["TN","Tunisia"],["ZM","Zambia"],
  ["ZW","Zimbabwe"],["BW","Botswana"],["NA","Namibia"],["MW","Malawi"],["MZ","Mozambique"],["SL","Sierra Leone"],["LR","Liberia"],["GM","Gambia"],
  ["BJ","Benin"],["TG","Togo"],["BF","Burkina Faso"],["ML","Mali"],["NE","Niger"],["CD","DR Congo"],["CG","Republic of the Congo"],["AO","Angola"],
  ["GA","Gabon"],["GQ","Equatorial Guinea"],["CV","Cabo Verde"],["MU","Mauritius"],["SC","Seychelles"],["SO","Somalia"],["SD","Sudan"],["SS","South Sudan"],
  ["ER","Eritrea"],["DJ","Djibouti"],["KM","Comoros"],["MG","Madagascar"],["MR","Mauritania"],["ST","São Tomé and Príncipe"],["LY","Libya"],
  ["LS","Lesotho"],["SZ","Eswatini"],["CF","Central African Republic"],["TD","Chad"],["GN","Guinea"],["GW","Guinea-Bissau"]
];

export default function AuthPage() {
  const router = useRouter();
  const [mode,setMode]=useState<Mode>("login");
  const [step,setStep]=useState<Step>("credentials");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [token,setToken]=useState("");
  const [channel,setChannel]=useState<"email"|"phone">("email");
  const [code,setCode]=useState("");
  const [identifier,setIdentifier]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [firstName,setFirstName]=useState("");
  const [email,setEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [countryCode,setCountryCode]=useState("GH");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [username,setUsername]=useState("");
  const [nickname,setNickname]=useState("");
  const [bio,setBio]=useState("");
  const [isPrivate,setIsPrivate]=useState(false);
  const [emailVerified,setEmailVerified]=useState(false);
  const [phoneVerified,setPhoneVerified]=useState(false);

  useEffect(()=>{
    fetch(API+"/auth/me",{
      credentials:"include",
      cache:"no-store",
      headers: typeof window!=="undefined" && localStorage.getItem(WEB_TOKEN_KEY)
        ? {Authorization:"Bearer "+localStorage.getItem(WEB_TOKEN_KEY)}
        : {}
    }).then(async r=>{
      if(!r.ok)return;
      const d=await r.json();
      if(d.user?.profileSetupComplete===false)setStep("profile"); else router.replace("/");
    }).catch(()=>{});
  },[router]);

  function switchMode(next:Mode){setMode(next);setStep("credentials");setError("");setMessage("");setToken("");setCode("");}

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try{
      if(mode==="login"){
        if(!identifier.trim()||!password)throw new Error("Enter your email or phone number and password.");
        const r=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({identifier:identifier.trim(),password})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.error??"Unable to sign in.");
        if(d.verificationRequired){setToken(d.token??""); if(d.token) localStorage.setItem(WEB_VERIFICATION_KEY,d.token);setEmailVerified(d.user?.emailVerified===true);setPhoneVerified(d.user?.phoneVerified===true);setChannel("email");setStep("verify");setMessage("Choose your registered email or phone number to receive an OTP.");return;}
        if(d.token) localStorage.setItem(WEB_TOKEN_KEY,d.token); if(d.profileSetupRequired||d.user?.profileSetupComplete===false){setToken(d.token??"");setStep("profile");setMessage("Finish your profile before entering TwiTok.");return;}
        router.replace("/"); router.refresh(); return;
      }
      if(!firstName.trim())throw new Error("Enter your first name.");
      if(!dateOfBirth)throw new Error("Enter your date of birth.");
      if(password.length<8)throw new Error("Password must contain at least 8 characters.");
      if(password!==confirmPassword)throw new Error("Passwords do not match.");
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw new Error("Enter a valid email address.");
      if(phone.replace(/\D/g,"").length<7)throw new Error("Enter a valid phone number.");
      const r=await fetch(API+"/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName:firstName.trim(),email:email.trim().toLowerCase(),phone:phone.trim(),password,dateOfBirth,countryCode})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Unable to create account.");
      setToken(d.token??""); if(d.token) localStorage.setItem(WEB_VERIFICATION_KEY,d.token); setEmailVerified(false); setPhoneVerified(false); setChannel("email"); setStep("verify"); setMessage("Account created. Choose where you want to receive your OTP.");
    }catch(err){setError(err instanceof Error?err.message:"Something went wrong.");}
    finally{setBusy(false);}
  }

  async function sendVerification(nextChannel:"email"|"phone"){
    setBusy(true);setError("");setMessage("");
    try{
      const verificationToken=token||localStorage.getItem(WEB_VERIFICATION_KEY)||"";
      if(!verificationToken)throw new Error("Verification session expired. Please start again.");
      const r=await fetch(API+"/auth/verification/send",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+verificationToken},credentials:"include",body:JSON.stringify({channel:nextChannel})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Verification delivery is temporarily unavailable.");
      setChannel(nextChannel);setCode("");setMessage(`OTP sent to your registered ${nextChannel==="email"?"email address":"phone number"}.`);
    }catch(err){setError(err instanceof Error?err.message:"Verification delivery is temporarily unavailable.");}
    finally{setBusy(false);}
  }

  async function verify(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      if(!/^\d{6}$/.test(code))throw new Error("Enter the 6-digit verification code.");
      const verificationToken=token||localStorage.getItem(WEB_VERIFICATION_KEY)||"";
      if(!verificationToken)throw new Error("Verification session expired. Please start again.");
      const r=await fetch(API+"/auth/verification/verify",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+verificationToken},credentials:"include",body:JSON.stringify({channel,code})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Verification failed.");
      setEmailVerified(d.user?.emailVerified===true);setPhoneVerified(d.user?.phoneVerified===true);
      if(d.verificationRequired){
        setCode("");setMessage(channel==="email"?"Email verified. Now verify your phone number.":"Phone verified. Now verify your email address.");
        return;
      }
      if(d.token) localStorage.setItem(WEB_TOKEN_KEY,d.token);
      localStorage.removeItem(WEB_VERIFICATION_KEY);setToken(d.token??verificationToken);
      if(d.user?.profileSetupComplete===false){setStep("profile");setMessage("Verification complete. Choose your unique username.");}
      else{router.replace("/");router.refresh();}
    }catch(err){setError(err instanceof Error?err.message:"Verification failed.");}
    finally{setBusy(false);}
  }

  async function completeProfile(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      if(!/^[a-z0-9._]{3,24}$/.test(username)||username.endsWith("."))throw new Error("Username must be 3–24 characters using letters, numbers, dots or underscores.");
      if(!nickname.trim())throw new Error("Enter your nickname.");
      const r=await fetch(API+"/auth/profile-setup",{method:"PATCH",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},credentials:"include",body:JSON.stringify({username:username.trim().toLowerCase(),nickname:nickname.trim(),bio:bio.trim(),isPrivate})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Unable to complete profile setup.");
      router.replace("/");router.refresh();
    }catch(err){setError(err instanceof Error?err.message:"Unable to complete profile setup.");}
    finally{setBusy(false);}
  }

  return <main className="auth-screen">
    <div className="auth-glow auth-glow-one"/><div className="auth-glow auth-glow-two"/>
    <section className="auth-card">
      <div className="auth-brand">Twi<span>Tok</span></div>
      <div className="auth-badge">SOCIAL VIDEO COMMUNITY</div>
      <h1>{step==="verify"?"Verify your account":step==="profile"?"Set up your profile":mode==="login"?"Welcome back":"Create your account"}</h1>
      <p className="auth-subtitle">{step==="verify"?"Enter your one-time verification code.":step==="profile"?"Every account must have a unique username before entering TwiTok.":"Sign in or create your account to continue."}</p>

      {step==="credentials"&&<>
        <div className="auth-tabs"><button className={mode==="login"?"active":""} onClick={()=>switchMode("login")}>Log in</button><button className={mode==="signup"?"active":""} onClick={()=>switchMode("signup")}>Sign up</button></div>
        <form onSubmit={submit} className="auth-form">
          {mode==="login"?<>
            <label>Email or phone number<input value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="email tel" placeholder="Email address or phone number"/></label>
            <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password"/></label>
            <button className="auth-primary" disabled={busy}>{busy?"Signing in…":"Log in"}</button>
          </>:<>
            <label>First name<input value={firstName} onChange={e=>setFirstName(e.target.value)} autoComplete="given-name" placeholder="First name"/></label>
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required/></label>
            <label>Phone number<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" placeholder="+233…" required/></label>
            <label>Country<select value={countryCode} onChange={e=>setCountryCode(e.target.value)}>{countries.map(([c,n])=><option key={c} value={c}>{n} ({c})</option>)}</select></label>
            <label>Date of birth<input type="date" value={dateOfBirth} onChange={e=>setDateOfBirth(e.target.value)}/></label>
            <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters"/></label>
            <label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Repeat password"/></label>
            <button className="auth-primary" disabled={busy}>{busy?"Creating account…":"Create account"}</button>
          </>}
        </form>
      </>}

      {step==="verify"&&<form onSubmit={verify} className="auth-form">
        <div className="auth-code-icon">✓</div>
        <p className="auth-help">Both your registered email and phone number must be verified. Choose where to receive your next OTP.</p>
        <div className="auth-choice-row">
          <button type="button" className={channel==="email"?"selected":""} disabled={busy||emailVerified} onClick={()=>sendVerification("email")}>✉ Email {emailVerified?"✓":"Send OTP"}</button>
          <button type="button" className={channel==="phone"?"selected":""} disabled={busy||phoneVerified} onClick={()=>sendVerification("phone")}>☎ Phone {phoneVerified?"✓":"Send OTP"}</button>
        </div>
        {channel&&((channel==="email"&&!emailVerified)||(channel==="phone"&&!phoneVerified))?<label>6-digit verification code<input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000"/></label>:null}
        {channel&&((channel==="email"&&!emailVerified)||(channel==="phone"&&!phoneVerified))?<button className="auth-primary" disabled={busy||code.length!==6}>{busy?"Verifying…":`Verify ${channel}`}</button>:null}
        <button type="button" className="auth-link" onClick={()=>{setStep("credentials");setError("");}}>Use another account</button>
      </form>}

      {step==="profile"&&<form onSubmit={completeProfile} className="auth-form"><label>Unique username<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g,"").slice(0,24))} placeholder="yourusername"/></label><small className="auth-help">3–24 characters. Username is required.</small><label>Nickname<input value={nickname} onChange={e=>setNickname(e.target.value.slice(0,50))} placeholder="Display name"/></label><label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value.slice(0,80))} placeholder="Tell people about you"/></label><label className="auth-check"><input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)}/> Private account</label><button className="auth-primary" disabled={busy}>{busy?"Saving…":"Enter TwiTok"}</button></form>}

      {message?<div className="auth-message">{message}</div>:null}{error?<div className="auth-error">{error}</div>:null}
      {step==="credentials"?<p className="auth-footer">Your account must be verified and your username completed before you can enter TwiTok.</p>:null}
    </section>
  </main>;
}
