export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getBotConfig, getTradeLogs } from "@/lib/firestore";
import { getAccount, getPositions, executeOrder, updateSimulationPrices, isAlpacaConfigured } from "@/lib/alpaca";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const ASSET = "BTC/USD";

// Helper to generate simulated historical prices using a wave function
function generateSimulatedPrices(timeIndex: number, length: number): number[] {
  const prices: number[] = [];
  for (let i = length - 1; i >= 0; i--) {
    const t = timeIndex - i;
    // Oscillating sine + cosine wave to create trends and crossovers
    const price = 60000 + 4500 * Math.sin(t * 0.4) + 1200 * Math.cos(t * 0.18);
    prices.push(price);
  }
  return prices;
}

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(prices.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || "system-default";

  try {
    // 1. Fetch Bot Configuration
    const config = await getBotConfig(userId);
    if (!config.active) {
      return NextResponse.json({
        success: false,
        status: "paused",
        message: "Trading bot is paused. Turn it on in the control panel.",
      });
    }

    // 2. Fetch Account Info & Positions
    const account = await getAccount(userId);
    const positions = await getPositions(userId);
    const activePosition = positions.find((p) => p.symbol === ASSET);

    // 3. Obtain Price Data & Calculate Indicators
    let currentPrice = 0;
    let prices: number[] = [];
    let prevPrices: number[] = [];

    const isReal = isAlpacaConfigured();

    if (isReal) {
      try {
        // Fetch real historical hourly bars from Alpaca for BTC/USD
        const headers = {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
          "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET || "",
        };
        // Fetch last 30 hourly bars
        const response = await fetch(
          `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${ASSET}&timeframe=1Hour&limit=30`,
          { headers }
        );
        if (!response.ok) throw new Error("Failed to fetch real bars");
        const data = await response.json();
        const bars = data.bars[ASSET] || [];
        
        if (bars.length >= 22) {
          prices = bars.map((b: any) => b.c);
          currentPrice = prices[prices.length - 1];
          // Previous prices slice for crossover checking
          prevPrices = prices.slice(0, prices.length - 1);
        } else {
          throw new Error("Insufficient bars from Alpaca, falling back to simulation");
        }
      } catch (err) {
        console.error("Real price fetch failed, using simulation:", err);
      }
    }

    // Simulation price generation fallback
    if (prices.length === 0) {
      const stateRef = doc(db, "users", userId, "simulation", "market_state");
      const stateSnap = await getDoc(stateRef);
      let timeIndex = 0;
      if (stateSnap.exists()) {
        timeIndex = stateSnap.data().timeIndex + 1;
      }
      await setDoc(stateRef, { timeIndex });

      prices = generateSimulatedPrices(timeIndex, 30);
      prevPrices = generateSimulatedPrices(timeIndex - 1, 30);
      currentPrice = prices[prices.length - 1];

      // Update current price of simulated positions in Firestore
      await updateSimulationPrices(userId, { [ASSET]: currentPrice });
    }

    // Calculate SMAs
    const sma9 = calculateSMA(prices, 9);
    const sma21 = calculateSMA(prices, 21);
    const prevSma9 = calculateSMA(prevPrices, 9);
    const prevSma21 = calculateSMA(prevPrices, 21);

    const goldenCross = prevSma9 <= prevSma21 && sma9 > sma21;
    const deathCross = prevSma9 >= prevSma21 && sma9 < sma21;

    let actionTaken = "NONE";
    let message = `Market check completed. Price: $${currentPrice.toFixed(2)} | SMA9: $${sma9.toFixed(2)} | SMA21: $${sma21.toFixed(2)}`;

    // 4. Execute Crossover Strategy
    if (goldenCross) {
      // Golden Cross -> BUY Signal
      if (!activePosition || activePosition.qty === 0) {
        // Run Risk Management checks
        // C1: Max Position Size
        let buyAmount = 10000; // Default desired trade size in USD
        if (buyAmount > config.maxPositionSize) {
          buyAmount = config.maxPositionSize;
        }

        // C2: Daily Stop-Loss Check
        const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const trades = await getTradeLogs(userId, 50);
        const todayTrades = trades.filter((t) => t.timestamp.startsWith(todayStr));
        const todayPnL = todayTrades.reduce((sum, t) => sum + t.profit, 0);

        const maxAllowedLoss = (config.dailyStopLossPercent * account.equity) / 100;

        if (todayPnL < 0 && Math.abs(todayPnL) >= maxAllowedLoss) {
          actionTaken = "BLOCKED_BY_RISK";
          message = `BUY signal blocked. Daily realized loss ($${Math.abs(todayPnL).toFixed(2)}) exceeds stop-loss limit ($${maxAllowedLoss.toFixed(2)}).`;
        } else if (account.cash < buyAmount) {
          actionTaken = "BLOCKED_BY_FUNDS";
          message = `BUY signal blocked. Insufficient cash ($${account.cash.toFixed(2)}) for order size ($${buyAmount.toFixed(2)}).`;
        } else {
          // Place Order
          const qty = buyAmount / currentPrice;
          const orderResult = await executeOrder(userId, ASSET, qty, "BUY", currentPrice);
          
          if (orderResult.success) {
            actionTaken = "BUY";
            message = `BUY executed: Bought ${qty.toFixed(4)} BTC at $${currentPrice.toFixed(2)} (Value: $${buyAmount.toFixed(2)})`;
          } else {
            actionTaken = "FAILED";
            message = `BUY execution failed: ${orderResult.error}`;
          }
        }
      } else {
        message += " | Golden Cross detected but position already exists. Holding.";
      }
    } else if (deathCross) {
      // Death Cross -> SELL Signal (Close position)
      if (activePosition && activePosition.qty > 0) {
        const qty = activePosition.qty;
        const orderResult = await executeOrder(userId, ASSET, qty, "SELL", currentPrice);
        
        if (orderResult.success) {
          actionTaken = "SELL";
          const realizedPL = qty * (currentPrice - activePosition.avg_entry_price);
          message = `SELL executed: Closed position of ${qty.toFixed(4)} BTC at $${currentPrice.toFixed(2)}. Realized PnL: $${realizedPL.toFixed(2)}`;
        } else {
          actionTaken = "FAILED";
          message = `SELL execution failed: ${orderResult.error}`;
        }
      } else {
        message += " | Death Cross detected but no active position to close.";
      }
    }

    return NextResponse.json({
      success: true,
      action: actionTaken,
      message,
      indicators: {
        price: currentPrice,
        sma9,
        sma21,
        prevSma9,
        prevSma21,
      },
      account: {
        cash: account.cash,
        equity: account.equity,
      },
    });
  } catch (error: any) {
    console.error("Trading Engine execution error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Execution engine failure" },
      { status: 500 }
    );
  }
}
