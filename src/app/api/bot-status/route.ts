export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getBotConfig, saveBotConfig } from "@/lib/firestore";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || "system-default";

  try {
    const config = await getBotConfig(userId);
    return NextResponse.json(config);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to get config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, active, maxPositionSize, dailyStopLossPercent } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (
      typeof active !== "boolean" ||
      typeof maxPositionSize !== "number" ||
      typeof dailyStopLossPercent !== "number"
    ) {
      return NextResponse.json({ error: "Invalid configuration fields" }, { status: 400 });
    }

    await saveBotConfig(userId, {
      active,
      maxPositionSize,
      dailyStopLossPercent,
    });

    return NextResponse.json({ success: true, message: "Configuration saved successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save config" }, { status: 500 });
  }
}
