import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { addTradeLog } from "./firestore";

export interface AccountInfo {
  cash: number;
  equity: number;
  portfolio_value: number;
  currency: string;
}

export interface PositionInfo {
  symbol: string;
  qty: number;
  market_value: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pl: number;
}

export function isAlpacaConfigured(): boolean {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  return !!(
    key &&
    key !== "your_alpaca_api_key" &&
    key.trim() !== "" &&
    secret &&
    secret !== "your_alpaca_api_secret" &&
    secret.trim() !== ""
  );
}

const getAlpacaHeaders = () => {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET || "",
    "Content-Type": "application/json",
  };
};

const ALPACA_API_URL = process.env.ALPACA_API_USE_PAPER === "true"
  ? "https://paper-api.alpaca.markets"
  : "https://api.alpaca.markets";

// Helper to fetch account info
export async function getAccount(userId: string): Promise<AccountInfo> {
  if (isAlpacaConfigured()) {
    try {
      const response = await fetch(`${ALPACA_API_URL}/v2/account`, {
        headers: getAlpacaHeaders(),
      });
      if (!response.ok) throw new Error(`Alpaca API error: ${response.statusText}`);
      const data = await response.json();
      return {
        cash: parseFloat(data.cash),
        equity: parseFloat(data.equity),
        portfolio_value: parseFloat(data.portfolio_value),
        currency: data.currency,
      };
    } catch (error) {
      console.error("Failed to fetch real Alpaca account, using simulation fallback:", error);
    }
  }

  // Simulation fallback
  const accountRef = doc(db, "users", userId, "simulation", "account");
  const snap = await getDoc(accountRef);
  if (snap.exists()) {
    const data = snap.data();
    // Re-calculate equity = cash + market value of all positions
    const positions = await getPositions(userId);
    const mktVal = positions.reduce((sum, p) => sum + p.market_value, 0);
    const currentEquity = data.cash + mktVal;
    
    // Save updated equity
    await setDoc(accountRef, { cash: data.cash, equity: currentEquity }, { merge: true });

    return {
      cash: data.cash,
      equity: currentEquity,
      portfolio_value: currentEquity,
      currency: "USD",
    };
  } else {
    // Initialize simulation account
    const initialAccount = { cash: 100000, equity: 100000 };
    await setDoc(accountRef, initialAccount);
    return {
      cash: 100000,
      equity: 100000,
      portfolio_value: 100000,
      currency: "USD",
    };
  }
}

// Helper to fetch active positions
export async function getPositions(userId: string): Promise<PositionInfo[]> {
  if (isAlpacaConfigured()) {
    try {
      const response = await fetch(`${ALPACA_API_URL}/v2/positions`, {
        headers: getAlpacaHeaders(),
      });
      if (!response.ok) throw new Error(`Alpaca API error: ${response.statusText}`);
      const data = await response.json();
      return data.map((p: any) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        market_value: parseFloat(p.market_value),
        avg_entry_price: parseFloat(p.avg_entry_price),
        current_price: parseFloat(p.current_price),
        unrealized_pl: parseFloat(p.unrealized_pl),
      }));
    } catch (error) {
      console.error("Failed to fetch real Alpaca positions, using simulation fallback:", error);
    }
  }

  // Simulation fallback
  const positionsCol = collection(db, "users", userId, "simulation_positions");
  const snap = await getDocs(positionsCol);
  const positions: PositionInfo[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    positions.push({
      symbol: docSnap.id,
      qty: data.qty,
      avg_entry_price: data.avg_entry_price,
      current_price: data.current_price,
      market_value: data.qty * data.current_price,
      unrealized_pl: data.qty * (data.current_price - data.avg_entry_price),
    });
  });
  return positions;
}

// Helper to update mock current prices in simulation mode
export async function updateSimulationPrices(userId: string, priceMap: Record<string, number>): Promise<void> {
  const positionsCol = collection(db, "users", userId, "simulation_positions");
  const snap = await getDocs(positionsCol);
  const batch = writeBatch(db);
  snap.forEach((docSnap) => {
    const symbol = docSnap.id;
    if (priceMap[symbol]) {
      batch.update(docSnap.ref, { current_price: priceMap[symbol] });
    }
  });
  await batch.commit();
}

// Helper to execute order
export async function executeOrder(
  userId: string,
  symbol: string,
  qty: number,
  side: "BUY" | "SELL",
  currentPrice: number
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (isAlpacaConfigured()) {
    try {
      const response = await fetch(`${ALPACA_API_URL}/v2/orders`, {
        method: "POST",
        headers: getAlpacaHeaders(),
        body: JSON.stringify({
          symbol,
          qty: qty.toString(),
          side: side.toLowerCase(),
          type: "market",
          time_in_force: "gtc",
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }
      const order = await response.json();
      
      // Real trades will be logged into Firestore viawebhook or fetch confirmation.
      // We will also manually add the log here for direct UI tracking.
      await addTradeLog(userId, {
        asset: symbol,
        side,
        price: currentPrice,
        qty,
        timestamp: new Date().toISOString(),
        profit: 0, // In real Alpaca we don't calculate realized PnL instantly on this route easily, default to 0
      });

      return { success: true, orderId: order.id };
    } catch (error: any) {
      console.error("Alpaca order execution failed:", error);
      return { success: false, error: error.message || "Unknown error" };
    }
  }

  // Simulation Mode Order Execution
  try {
    const accountRef = doc(db, "users", userId, "simulation", "account");
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) {
      await getAccount(userId); // initialize
    }
    const accountData = (await getDoc(accountRef)).data()!;
    let cash = accountData.cash;

    const positionRef = doc(db, "users", userId, "simulation_positions", symbol);
    const positionSnap = await getDoc(positionRef);

    let profit = 0;

    if (side === "BUY") {
      const cost = qty * currentPrice;
      if (cash < cost) {
        return { success: false, error: `Insufficient simulated funds. Required: $${cost.toFixed(2)}, Available: $${cash.toFixed(2)}` };
      }
      cash -= cost;

      if (positionSnap.exists()) {
        const posData = positionSnap.data();
        const newQty = posData.qty + qty;
        const newAvg = (posData.qty * posData.avg_entry_price + cost) / newQty;
        await setDoc(positionRef, {
          qty: newQty,
          avg_entry_price: newAvg,
          current_price: currentPrice,
        });
      } else {
        await setDoc(positionRef, {
          qty,
          avg_entry_price: currentPrice,
          current_price: currentPrice,
        });
      }
    } else {
      // SELL
      if (!positionSnap.exists()) {
        return { success: false, error: `No active position in ${symbol} to sell.` };
      }
      const posData = positionSnap.data();
      if (posData.qty < qty) {
        return { success: false, error: `Insufficient position qty to sell. Available: ${posData.qty}, Requested: ${qty}` };
      }

      const revenue = qty * currentPrice;
      cash += revenue;
      profit = qty * (currentPrice - posData.avg_entry_price);

      const remainingQty = posData.qty - qty;
      if (remainingQty <= 0) {
        await deleteDoc(positionRef);
      } else {
        await setDoc(positionRef, {
          qty: remainingQty,
          avg_entry_price: posData.avg_entry_price,
          current_price: currentPrice,
        });
      }
    }

    // Save updated account cash and recalculate equity
    const positions = await getPositions(userId);
    const mktVal = positions.reduce((sum, p) => sum + p.market_value, 0);
    const newEquity = cash + mktVal;
    await setDoc(accountRef, { cash, equity: newEquity });

    // Log the trade to user's trade history in Firestore
    await addTradeLog(userId, {
      asset: symbol,
      side,
      price: currentPrice,
      qty,
      timestamp: new Date().toISOString(),
      profit,
    });

    return { success: true, orderId: `sim-order-${Date.now()}` };
  } catch (error: any) {
    console.error("Simulation order execution error:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}
