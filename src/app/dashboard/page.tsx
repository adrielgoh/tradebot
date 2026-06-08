"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getBotConfig, getTradeLogs, TradeLog, BotConfig } from "@/lib/firestore";
import { getAccount, getPositions, AccountInfo, PositionInfo, isAlpacaConfigured } from "@/lib/alpaca";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Settings,
  LogOut,
  RefreshCw,
  History,
  DollarSign,
  Activity,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const ASSET = "BTC/USD";

interface ActivityLog {
  time: string;
  type: "INFO" | "BUY" | "SELL" | "WARNING" | "ERROR" | "BLOCKED";
  message: string;
}

export default function Dashboard() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  // State variables
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runningBot, setRunningBot] = useState(false);
  const [isAlpaca, setIsAlpaca] = useState(false);

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [config, setConfig] = useState<BotConfig>({
    active: false,
    maxPositionSize: 1000,
    dailyStopLossPercent: 2.0,
  });

  // Risk inputs
  const [maxPosSizeInput, setMaxPosSizeInput] = useState<string>("1000");
  const [stopLossInput, setStopLossInput] = useState<string>("2.0");
  const [savingConfig, setSavingConfig] = useState(false);

  // Live indicators
  const [indicators, setIndicators] = useState<{
    price: number;
    sma9: number;
    sma21: number;
    prevSma9: number;
    prevSma21: number;
  } | null>(null);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Guard navigation
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch initial dashboard metrics
  const fetchDashboardData = async (uid: string) => {
    try {
      const botConf = await getBotConfig(uid);
      const acc = await getAccount(uid);
      const pos = await getPositions(uid);
      const trs = await getTradeLogs(uid, 50);

      setConfig(botConf);
      setMaxPosSizeInput(botConf.maxPositionSize.toString());
      setStopLossInput(botConf.dailyStopLossPercent.toString());
      
      setAccount(acc);
      setPositions(pos);
      setTrades(trs);
      setIsAlpaca(isAlpacaConfigured());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      addActivityLog("ERROR", "Failed to reload portfolio metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData(user.uid);
      addActivityLog("INFO", "Quantum terminal initialized. Connected to Firestore.");
    }
  }, [user]);

  // Scroll console to bottom
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLogs]);

  // Bot background execution ticker
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (config.active && user) {
      addActivityLog("INFO", "Background execution loop started. Ticker interval: 10s.");
      
      const triggerEngine = async () => {
        setRunningBot(true);
        try {
          const res = await fetch(`/api/trade?userId=${user.uid}`);
          const data = await res.json();
          
          if (data.success) {
            // Update account & positions
            if (data.account) {
              setAccount((prev) => ({
                ...prev!,
                cash: data.account.cash,
                equity: data.account.equity,
                portfolio_value: data.account.equity,
              }));
            }
            if (data.indicators) {
              setIndicators(data.indicators);
            }

            // Map action to log type
            let logType: ActivityLog["type"] = "INFO";
            if (data.action === "BUY") logType = "BUY";
            else if (data.action === "SELL") logType = "SELL";
            else if (data.action.startsWith("BLOCKED")) logType = "BLOCKED";

            addActivityLog(logType, data.message);

            // If a trade was executed, refetch positions and trades list
            if (data.action === "BUY" || data.action === "SELL") {
              const updatedPos = await getPositions(user.uid);
              const updatedTrades = await getTradeLogs(user.uid, 50);
              setPositions(updatedPos);
              setTrades(updatedTrades);
            }
          } else {
            addActivityLog("ERROR", `Engine warning: ${data.error || data.message}`);
          }
        } catch (error) {
          console.error("Ticker fetch error:", error);
          addActivityLog("ERROR", "Unable to establish contact with execution engine API.");
        } finally {
          setRunningBot(false);
        }
      };

      // Run once immediately, then interval
      triggerEngine();
      interval = setInterval(triggerEngine, 10000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [config.active, user]);

  const addActivityLog = (type: ActivityLog["type"], message: string) => {
    const timeStr = new Date().toTimeString().split(" ")[0];
    setActivityLogs((prev) => [...prev, { time: timeStr, type, message }]);
  };

  // Manual execution trigger
  const handleManualTrigger = async () => {
    if (!user) return;
    setRunningBot(true);
    addActivityLog("INFO", "Manual execution cycle triggered by developer.");
    try {
      const res = await fetch(`/api/trade?userId=${user.uid}`);
      const data = await res.json();
      if (data.success) {
        if (data.account) {
          setAccount((prev) => ({
            ...prev!,
            cash: data.account.cash,
            equity: data.account.equity,
            portfolio_value: data.account.equity,
          }));
        }
        if (data.indicators) {
          setIndicators(data.indicators);
        }

        let logType: ActivityLog["type"] = "INFO";
        if (data.action === "BUY") logType = "BUY";
        else if (data.action === "SELL") logType = "SELL";
        else if (data.action.startsWith("BLOCKED")) logType = "BLOCKED";

        addActivityLog(logType, data.message);

        if (data.action === "BUY" || data.action === "SELL") {
          const updatedPos = await getPositions(user.uid);
          const updatedTrades = await getTradeLogs(user.uid, 50);
          setPositions(updatedPos);
          setTrades(updatedTrades);
        }
      } else {
        addActivityLog("WARNING", data.message || data.error);
      }
    } catch (error) {
      addActivityLog("ERROR", "Manual API run failed.");
    } finally {
      setRunningBot(false);
    }
  };

  // Save risk configuration
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingConfig(true);

    const newSize = parseFloat(maxPosSizeInput);
    const newLoss = parseFloat(stopLossInput);

    if (isNaN(newSize) || newSize <= 0 || isNaN(newLoss) || newLoss <= 0) {
      addActivityLog("ERROR", "Invalid input parameters. Cap size and stop-loss must be positive numbers.");
      setSavingConfig(false);
      return;
    }

    try {
      const res = await fetch("/api/bot-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          active: config.active,
          maxPositionSize: newSize,
          dailyStopLossPercent: newLoss,
        }),
      });

      if (res.ok) {
        setConfig((prev) => ({
          ...prev,
          maxPositionSize: newSize,
          dailyStopLossPercent: newLoss,
        }));
        addActivityLog(
          "INFO",
          `Risk limits updated: Max Position = $${newSize.toFixed(2)}, Daily Stop-Loss = ${newLoss.toFixed(1)}%.`
        );
      } else {
        addActivityLog("ERROR", "Failed to update risk config in backend.");
      }
    } catch (error) {
      addActivityLog("ERROR", "Network error updating risk configurations.");
    } finally {
      setSavingConfig(false);
    }
  };

  // Toggle Bot Active/Paused status
  const handleBotToggle = async () => {
    if (!user) return;
    const nextState = !config.active;

    try {
      const res = await fetch("/api/bot-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          active: nextState,
          maxPositionSize: config.maxPositionSize,
          dailyStopLossPercent: config.dailyStopLossPercent,
        }),
      });

      if (res.ok) {
        setConfig((prev) => ({ ...prev, active: nextState }));
        addActivityLog(
          "INFO",
          nextState
            ? "Trading bot ACTIVATED. Listening for golden/death crossovers."
            : "Trading bot DEACTIVATED. Execution engine suspended."
        );
      } else {
        addActivityLog("ERROR", "Failed to save bot state.");
      }
    } catch (error) {
      addActivityLog("ERROR", "Network error toggling bot state.");
    }
  };

  // Prepare chart data based on trade logs
  const getChartData = () => {
    const dataPoints: { name: string; equity: number }[] = [];
    let baseEquity = 100000;
    
    // Default initial points to show progress before trades
    dataPoints.push({ name: "Start", equity: baseEquity });

    if (trades.length > 0) {
      // Reverse copy to go in chronological order
      const chronTrades = [...trades].reverse();
      chronTrades.forEach((t, i) => {
        if (t.side === "SELL" && t.profit) {
          baseEquity += t.profit;
        }
        const date = new Date(t.timestamp);
        const label = `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        dataPoints.push({ name: label, equity: baseEquity });
      });
    }

    // If only 1 point, add a dummy future point to draw a line
    if (dataPoints.length === 1) {
      dataPoints.push({ name: "Running", equity: account?.equity || 100000 });
    }

    return dataPoints;
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950">
        <div className="h-12 w-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
      </div>
    );
  }

  const activeBTC = positions.find((p) => p.symbol === ASSET);
  const chartData = getChartData();
  const currentTotalEquity = account?.equity || 100000;
  const initialValue = 100000;
  const profitPercentage = ((currentTotalEquity - initialValue) / initialValue) * 100;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center shadow-md shadow-indigo-500/10">
            <Zap className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="font-extrabold text-lg tracking-tight">
            AETHER<span className="text-emerald-400">TRADE</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 ml-2">
            CONSOLE
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs text-zinc-300 font-medium">{user.email}</span>
            <span className="text-[10px] text-zinc-500 font-mono">UID: {user.uid.substring(0, 8)}...</span>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-950 text-xs font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Balance Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-6 backdrop-blur-xl relative overflow-hidden group shadow-lg"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign className="h-24 w-24 text-indigo-400" />
            </div>

            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Account Growth</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isAlpaca ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20" : "bg-indigo-950/40 text-indigo-400 border border-indigo-500/20"
              }`}>
                {isAlpaca ? "Alpaca API" : "Simulated"}
              </span>
            </div>

            <div className="mt-4 space-y-1">
              <h2 className="text-3xl font-black text-white tracking-tight">
                ${currentTotalEquity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <p className="text-xs text-zinc-400 flex items-center gap-1">
                Cash balance: <span className="font-mono text-zinc-200">${account?.cash.toLocaleString("en-US", { minimumFractionDigits: 2 }) || "100,000.00"}</span>
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-900/60 flex justify-between items-center text-xs">
              <span className="text-zinc-500">Unrealized P&L</span>
              <span className={`font-mono font-bold flex items-center gap-0.5 ${profitPercentage >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {profitPercentage >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {profitPercentage >= 0 ? "+" : ""}
                {profitPercentage.toFixed(3)}%
              </span>
            </div>
          </motion.div>

          {/* Card 2: Active Positions Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-6 backdrop-blur-xl relative overflow-hidden group shadow-lg"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Active Positions</span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>

            {activeBTC && activeBTC.qty > 0 ? (
              <div className="mt-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <h3 className="text-2xl font-bold text-white tracking-tight">
                    {activeBTC.qty.toFixed(5)} <span className="text-xs text-zinc-400">BTC</span>
                  </h3>
                  <span className="text-xs font-mono text-zinc-300">
                    Mkt: ${activeBTC.market_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>Avg. Entry:</span>
                    <span className="text-zinc-300">${activeBTC.avg_entry_price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Price:</span>
                    <span className="text-zinc-300">${activeBTC.current_price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-zinc-900/60 flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Position P&L</span>
                  <span className={`font-mono font-bold ${activeBTC.unrealized_pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {activeBTC.unrealized_pl >= 0 ? "+" : ""}
                    ${activeBTC.unrealized_pl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center justify-center text-center space-y-2 py-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">FLAT / NO POSITIONS</span>
                <span className="text-[10px] text-zinc-600 font-mono">WAITING FOR GOLDEN CROSS ENTRY</span>
              </div>
            )}
          </motion.div>

          {/* Card 3: Execution Indicators Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-6 backdrop-blur-xl relative overflow-hidden group shadow-lg"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">SMA Indicators (1H)</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${config.active ? "bg-emerald-500 animate-ping" : "bg-rose-500"}`}></span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase">{config.active ? "Trading" : "Paused"}</span>
              </div>
            </div>

            {indicators ? (
              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-zinc-900/40">
                  <span className="text-zinc-500">BTC price:</span>
                  <span className="text-white font-bold">${indicators.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-zinc-900/40">
                  <span className="text-indigo-400 font-semibold">SMA-9 (Fast):</span>
                  <span className="text-zinc-200">${indicators.sma9.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-zinc-900/40">
                  <span className="text-purple-400 font-semibold">SMA-21 (Slow):</span>
                  <span className="text-zinc-200">${indicators.sma21.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center pt-2 text-[10px] text-zinc-500">
                  <span>Crossover Gap:</span>
                  <span className={`font-bold ${indicators.sma9 >= indicators.sma21 ? "text-emerald-400" : "text-rose-400"}`}>
                    ${(indicators.sma9 - indicators.sma21).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center justify-center text-center space-y-2 py-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">NO LIVE CALCULATIONS</span>
                <span className="text-[10px] text-zinc-600 font-mono">API NOT RUN YET</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Dashboard Core Grid (Chart + Bot Controls) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Area Chart (Span 2) */}
          <div className="lg:col-span-2 rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 backdrop-blur-xl shadow-lg flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white text-sm">Portfolio Growth Curve</h3>
                <p className="text-[10px] text-zinc-500 font-mono">Calculated cumulative equity based on realized trade outcomes</p>
              </div>
              <button
                onClick={() => user && fetchDashboardData(user.uid)}
                disabled={loading}
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Recharts Container */}
            <div className="h-64 w-full bg-zinc-950/40 border border-zinc-900/60 rounded-lg p-2 relative flex items-center justify-center">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                    <XAxis dataKey="name" stroke="#52525b" fontSize={9} tickLine={false} />
                    <YAxis
                      stroke="#52525b"
                      fontSize={9}
                      tickLine={false}
                      domain={["dataMin - 1000", "dataMax + 1000"]}
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "8px", fontSize: "11px" }}
                      labelClassName="text-zinc-400 font-bold"
                    />
                    <Area type="monotone" dataKey="equity" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <span className="text-xs text-zinc-600 font-mono">LOADING PLOTTER ENGINE...</span>
              )}
            </div>
          </div>

          {/* Bot Control Panel (Span 1) */}
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 backdrop-blur-xl shadow-lg flex flex-col justify-between space-y-6">
            <div className="space-y-1">
              <h3 className="font-bold text-white text-sm">Bot Control Console</h3>
              <p className="text-[10px] text-zinc-500 font-mono">Configure quantitative strategy and risk thresholds</p>
            </div>

            {/* Toggle Status */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-900 bg-zinc-950/60">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white block">Execution State</span>
                <span className="text-[10px] font-mono text-zinc-500 block">
                  {config.active ? "Actively checking hourly bars" : "Strategy engine halted"}
                </span>
              </div>

              <button
                onClick={handleBotToggle}
                className={`h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 font-bold text-xs tracking-wider transition-all cursor-pointer ${
                  config.active
                    ? "bg-rose-950/40 border border-rose-500/30 text-rose-400 hover:bg-rose-950"
                    : "bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-950"
                }`}
              >
                {config.active ? (
                  <>
                    <Pause className="h-4.5 w-4.5" /> PAUSE BOT
                  </>
                ) : (
                  <>
                    <Play className="h-4.5 w-4.5 fill-current" /> ACTIVATE
                  </>
                )}
              </button>
            </div>

            {/* Risk Settings Form */}
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 block">
                  Max Position Size (USD)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500 font-mono text-xs">
                    $
                  </div>
                  <input
                    type="number"
                    value={maxPosSizeInput}
                    onChange={(e) => setMaxPosSizeInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-lg py-2 pl-7 pr-3 text-xs font-semibold font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="e.g. 500"
                  />
                </div>
                <span className="text-[9px] text-zinc-500 font-mono block">Limits the maximum funds allocated per crossover entry.</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 block">
                  Daily Stop-Loss Limit (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={stopLossInput}
                    onChange={(e) => setStopLossInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-lg py-2 pl-3 pr-7 text-xs font-semibold font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="e.g. 2.0"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-zinc-500 font-mono text-xs">
                    %
                  </div>
                </div>
                <span className="text-[9px] text-zinc-500 font-mono block">Halts trading if realized daily PnL drops past this equity %.</span>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition-colors cursor-pointer"
                >
                  {savingConfig ? "Saving..." : "Save Risk Config"}
                </button>
                
                <button
                  type="button"
                  disabled={runningBot || !config.active}
                  onClick={handleManualTrigger}
                  className="px-3 border border-zinc-800 bg-zinc-900 hover:bg-zinc-950 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  title="Run one manual engine evaluation"
                >
                  <Activity className="h-3.5 w-3.5" /> Run Cycle
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Console Terminal & Trade History Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Console Terminal Log (Span 1) */}
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 backdrop-blur-xl shadow-lg flex flex-col justify-between space-y-4">
            <div>
              <h3 className="font-bold text-white text-sm">Live Engine Console</h3>
              <p className="text-[10px] text-zinc-500 font-mono">Raw system output from the strategy executor API</p>
            </div>

            <div className="h-56 bg-black/80 border border-zinc-900 rounded-lg p-3 font-mono text-[10px] overflow-y-auto space-y-2 flex flex-col select-none relative scrollbar-thin scrollbar-thumb-zinc-800">
              <div className="absolute top-2 right-2 flex gap-1.5 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[8px] text-zinc-500">LIVE FEED</span>
              </div>

              {activityLogs.length === 0 ? (
                <span className="text-zinc-600">Connecting to quantitative socket...</span>
              ) : (
                activityLogs.map((log, index) => {
                  let textClass = "text-zinc-400";
                  if (log.type === "BUY") textClass = "text-emerald-400 font-bold";
                  else if (log.type === "SELL") textClass = "text-amber-400 font-bold";
                  else if (log.type === "BLOCKED") textClass = "text-rose-400 font-bold";
                  else if (log.type === "ERROR") textClass = "text-rose-500 font-extrabold";

                  return (
                    <div key={index} className="leading-tight">
                      <span className="text-zinc-600">[{log.time}]</span>{" "}
                      <span className={textClass}>[{log.type}]</span> {log.message}
                    </div>
                  );
                })
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>

          {/* Trade History Table (Span 2) */}
          <div className="lg:col-span-2 rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 backdrop-blur-xl shadow-lg flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white text-sm">Trade Log Audit</h3>
                <p className="text-[10px] text-zinc-500 font-mono">List of executions recorded to Cloud Firestore</p>
              </div>
              <div className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                <History className="h-3.5 w-3.5" /> {trades.length} Logs
              </div>
            </div>

            {/* Table */}
            <div className="h-56 overflow-y-auto border border-zinc-900 rounded-lg bg-zinc-950/20">
              {trades.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-1">
                  <History className="h-8 w-8 text-zinc-700" />
                  <span className="text-xs font-semibold text-zinc-500 uppercase">Audit Trail Empty</span>
                  <p className="text-[10px] text-zinc-600 max-w-xs">Once the engine executes a golden cross (BUY) or death cross (SELL), the records will display here.</p>
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-xs font-mono select-none">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-400 font-bold text-[10px] uppercase border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-4">Time</th>
                      <th className="py-2.5 px-2">Asset</th>
                      <th className="py-2.5 px-2 text-center">Type</th>
                      <th className="py-2.5 px-2 text-right">Price</th>
                      <th className="py-2.5 px-2 text-right">Qty</th>
                      <th className="py-2.5 px-4 text-right">Profit / Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {trades.map((trade) => {
                      const date = new Date(trade.timestamp);
                      const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                      
                      return (
                        <tr key={trade.id} className="hover:bg-zinc-900/40">
                          <td className="py-2 px-4 text-zinc-500 text-[10px]">{timeStr}</td>
                          <td className="py-2 px-2 text-zinc-200 font-semibold">{trade.asset}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              trade.side === "BUY"
                                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/10"
                                : "bg-amber-950/40 text-amber-400 border border-amber-500/10"
                            }`}>
                              {trade.side}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-zinc-300">${trade.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-2 text-right text-zinc-300">{trade.qty.toFixed(4)}</td>
                          <td className={`py-2 px-4 text-right font-bold ${
                            trade.side === "SELL"
                              ? trade.profit >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                              : "text-zinc-500"
                          }`}>
                            {trade.side === "SELL" ? (
                              <>
                                {trade.profit >= 0 ? "+" : ""}
                                ${trade.profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </>
                            ) : (
                              "--"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Integration Instructions */}
        <div className="rounded-xl border border-zinc-900 bg-zinc-900/10 p-6 backdrop-blur-xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-indigo-400" /> Exchange Integration Credentials
            </span>
            <p className="text-[11px] text-zinc-500 leading-normal max-w-2xl">
              Currently running in **Simulation Mode** using Firestore. To switch to Alpaca Paper Trading, set your `ALPACA_API_KEY` and `ALPACA_API_SECRET` inside your local `.env.local` file. The server route will automatically hot-reload and connect to Alpaca.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
