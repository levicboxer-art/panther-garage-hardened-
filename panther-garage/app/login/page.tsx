"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setError(
        "Sign-in failed. Check your email and password, or ask the boss to activate your account.",
      );
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,active")
      .eq("id", user?.id || "")
      .single();
    if (profileError || !profile?.active) {
      await supabase.auth.signOut();
      setError("Your staff profile is not active. Contact the boss.");
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black md:grid md:grid-cols-2">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/login-motorcycle-v2.png"
          alt="Panther Garage motorcycle on a dark studio background"
          fill
          priority
          sizes="100vw"
          className="scale-[1.15] object-cover object-center brightness-125 contrast-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/35" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-lime/10 blur-[110px]" />
        <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-[#ff6044]/10 blur-[120px]" />
      </div>

      <section className="relative hidden min-h-screen flex-col justify-between border-r border-white/[.07] p-12 md:flex">
        <Link href="/" className="relative z-10 lime text-sm">
          ← Panther Legacy Garage
        </Link>

        <div className="relative z-10 max-w-md">
          <div className="tag">STAFF ACCESS</div>
          <h1 className="mt-4 text-6xl font-bold leading-[1.02] tracking-[-.04em]">
            THE GARAGE
            <br />
            <span className="lime">COMMAND</span>
            <br />
            CENTER.
          </h1>
          <p className="muted mt-5 max-w-sm leading-7">
            One secure workspace for stock, sales, workshop operations and
            business control.
          </p>
        </div>

        <p className="relative z-10 text-xs text-gray-600">
          PANTHER LEGACY GARAGE MANAGEMENT SYSTEM · PGMS
        </p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center p-6 md:p-10">
        <div className="login-card w-full max-w-md p-6 md:p-8">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="text-xs muted flex items-center gap-2"
            >
              <ArrowLeft size={14} /> Back to website
            </Link>
            <LanguageSwitcher />
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-lime text-black">
            <ShieldCheck />
          </div>
          <h2 className="mt-6 text-3xl font-bold">Welcome back.</h2>
          <p className="muted mt-2 text-sm">
            Sign in using your staff account.
          </p>

          <form onSubmit={submit} className="mt-8 grid gap-4">
            <label className="text-xs text-gray-400">
              Email address
              <input
                className="field mt-2"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@panthergarage.rw"
              />
            </label>
            <label className="text-xs text-gray-400">
              Password
              <input
                className="field mt-2"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              disabled={loading}
              className="btn btn-primary mt-2 w-full disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in to dashboard"}
            </button>
          </form>

          <p className="muted mt-5 text-[11px] leading-5">
            Only Boss-created staff accounts can access the management system.
            Public self-registration is disabled.
          </p>
        </div>
      </section>
    </main>
  );
}
