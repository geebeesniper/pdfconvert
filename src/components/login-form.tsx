"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@keyin.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json(); setLoading(false);
    if (!res.ok) return setError(data.error || "Login failed.");
    router.replace("/projects"); router.refresh();
  }
  return <form className="auth-form" onSubmit={submit}>
    <label>Email<input value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="username" /></label>
    <label>Password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
    {error && <div className="notice error">{error}</div>}
    <button className="primary" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
  </form>;
}
