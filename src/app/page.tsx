"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, ShieldAlert, Cpu, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const { user, loading, loginWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    try {
      await loginWithGoogle();
      router.push("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
          <div className="absolute h-8 w-8 rounded-full border-4 border-emerald-500/20 border-b-emerald-500 animate-spin duration-700"></div>
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-400 tracking-wider">LOADING QUANTUM ENGINE...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-zinc-950 flex flex-col justify-between overflow-hidden">
      {/* Decorative Radial Gradients */}
      <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Cpu className="h-5 w-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            AETHER<span className="text-emerald-400">TRADE</span>
          </span>
        </div>
        <div className="text-xs font-mono text-zinc-500 bg-zinc-900/60 border border-zinc-800 rounded-full px-3 py-1">
          v1.0.0-beta.2
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-950/30 text-indigo-400 text-xs font-semibold tracking-wide uppercase">
            <TrendingUp className="h-3 w-3" /> Algorithmic Trading Bot & Analytics
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
            Next-Gen Automated <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              Quantitative Execution
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-zinc-400 text-base sm:text-lg font-light leading-relaxed">
            Monitor real-time portfolio performance, set custom risk limits, and run automated trading strategies powered by live market signals.
          </p>
        </motion.div>

        {/* Call to Action Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-10 w-full max-w-md"
        >
          <div className="p-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl shadow-black/80 space-y-6 relative group">
            {/* Hover subtle card border glow */}
            <div className="absolute inset-[-1px] rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-all duration-500 -z-10 pointer-events-none" />

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Access the Execution Engine</h3>
              <p className="text-xs text-zinc-400 leading-normal">
                Sign in with Google to synchronize your Cloud Firestore portfolio settings, view trade history, and toggle the bot.
              </p>
            </div>

            <button
              onClick={handleSignIn}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-white text-zinc-950 hover:bg-zinc-100 font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-white/5 cursor-pointer"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.14-1.14 2.84v2.36h1.85c1.09-1 1.97-2.4 2.33-4.13.68-1.57 1.01-1.92 1.01-2.92z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.85-3c-1.08.72-2.45 1.16-4.11 1.16-3.17 0-5.85-2.14-6.81-5.03H1.23v3.1A11.96 11.96 0 0012 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.19 14.22A7.18 7.18 0 014.8 12c0-.79.13-1.57.39-2.31V6.59H1.23A11.97 11.97 0 000 12c0 2.22.6 4.3 1.23 5.41l3.96-3.19z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.24 0 3.1 2.7 1.23 6.59l3.96 3.1c.96-2.89 3.64-5.03 6.81-5.03z"
                />
              </svg>
              Sign In with Google
            </button>

            <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-amber-500/80" /> Encryption: Enabled
              </span>
              <span>AES-256 Storage</span>
            </div>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 w-full max-w-5xl">
          <div className="p-6 rounded-xl border border-zinc-900 bg-zinc-900/20 text-left space-y-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Cpu className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-white text-sm">Execution Engine</h4>
            <p className="text-xs text-zinc-400 leading-normal">
              An automated strategy engine running 9-21 SMA crossover analysis, checking entry points, and making mock or real API calls.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-900 bg-zinc-900/20 text-left space-y-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-white text-sm">Real-time Performance</h4>
            <p className="text-xs text-zinc-400 leading-normal">
              Track your portfolio equity growth, active coin positions, and detailed logs in dynamic charts and data tables.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-900 bg-zinc-900/20 text-left space-y-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ArrowRight className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-white text-sm">Dynamic Risk Capping</h4>
            <p className="text-xs text-zinc-400 leading-normal">
              Configure maximum order size limits and daily percentage stop-losses to automatically freeze executions if markets turn.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-6 text-center text-[11px] text-zinc-600 font-mono max-w-7xl w-full mx-auto border-t border-zinc-900/40">
        © 2026 AetherTrade Inc. Designed for quantitative developers.
      </footer>
    </div>
  );
}
