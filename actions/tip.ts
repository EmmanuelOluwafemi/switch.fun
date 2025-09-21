"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSelf } from "@/lib/auth-service";
import { broadcastTipNotification, createTipBroadcastData } from "@/lib/tip-broadcast";

// Input validation schemas
const createTipSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  tokenType: z.enum(["USDC", "SOL"]).default("USDC"),
  giftType: z.string().optional(),
  giftName: z.string().optional(),
  streamerId: z.string().min(1, "Streamer ID is required"),
  streamId: z.string().optional(),
  transactionHash: z.string().optional(),
});

const getTipsSchema = z.object({
  streamerId: z.string().min(1, "Streamer ID is required"),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

const getTipStatsSchema = z.object({
  streamerId: z.string().min(1, "Streamer ID is required"),
  timeRange: z.enum(["24h", "7d", "30d", "all"]).default("all"),
});

/**
 * Create a tip and broadcast it to the LiveKit room
 */
export async function createAndBroadcastTip(
  data: z.infer<typeof createTipSchema>,
  roomToken?: string
) {
  try {
    const validated = createTipSchema.parse(data);
    const self = await getSelf();

    // Create the tip record
    const tip = await db.tip.create({
      data: {
        amount: validated.amount,
        tokenType: validated.tokenType,
        giftType: validated.giftType,
        giftName: validated.giftName,
        tipperId: self.id,
        streamerId: validated.streamerId,
        streamId: validated.streamId,
        transactionHash: validated.transactionHash,
      },
      include: {
        tipper: {
          select: {
            id: true,
            username: true,
            imageUrl: true,
          },
        },
        streamer: {
          select: {
            id: true,
            username: true,
          },
        },
        stream: {
          select: {
            id: true,
            name: true,
            isLive: true,
          },
        },
      },
    });

    // Revalidate relevant paths
    revalidatePath(`/u/${tip.streamer.username}`);
    if (tip.stream) {
      revalidatePath(`/u/${tip.streamer.username}`);
    }

    // Broadcast tip notification if room token is provided
    if (roomToken) {
      try {
        const tipBroadcastData = createTipBroadcastData({
          ...tip,
          amount: Number(tip.amount), // Convert Decimal to number
        });
        // Note: We'll need to implement room connection on the server side
        // For now, we'll return the tip data for client-side broadcasting
      } catch (broadcastError) {
        console.error("Failed to broadcast tip:", broadcastError);
        // Don't fail the entire operation if broadcast fails
      }
    }

    return { success: true, data: tip };
  } catch (err: any) {
    console.error("[createAndBroadcastTip] error:", err);
    
    if (err instanceof z.ZodError) {
      throw new Error(err.errors[0]?.message || "Invalid input");
    }
    
    throw new Error(err.message || "Failed to create and broadcast tip");
  }
}

/**
 * Create a new tip record
 */
export async function createTip(data: z.infer<typeof createTipSchema>) {
  try {
    const validated = createTipSchema.parse(data);
    const self = await getSelf();

    // Create the tip record
    const tip = await db.tip.create({
      data: {
        amount: validated.amount, // Prisma will handle number to Decimal conversion
        tokenType: validated.tokenType,
        giftType: validated.giftType,
        giftName: validated.giftName,
        tipperId: self.id,
        streamerId: validated.streamerId,
        streamId: validated.streamId,
        transactionHash: validated.transactionHash,
      },
      include: {
        tipper: {
          select: {
            id: true,
            username: true,
            imageUrl: true,
          },
        },
        streamer: {
          select: {
            id: true,
            username: true,
            imageUrl: true,
          },
        },
        stream: {
          select: {
            id: true,
            name: true,
            isLive: true,
          },
        },
      },
    });

    // Revalidate relevant paths
    revalidatePath(`/u/${tip.streamer.username}`);
    if (tip.stream) {
      revalidatePath(`/u/${tip.streamer.username}`);
    }

    return { success: true, data: tip };
  } catch (err: any) {
    console.error("[createTip] error:", err);
    
    if (err instanceof z.ZodError) {
      throw new Error(err.errors[0]?.message || "Invalid input");
    }
    
    throw new Error(err.message || "Failed to create tip");
  }
}

/**
 * Get tips for a specific streamer
 */
export async function getTips(data: z.infer<typeof getTipsSchema>) {
  try {
    const validated = getTipsSchema.parse(data);

    const tips = await db.tip.findMany({
      where: {
        streamerId: validated.streamerId,
      },
      include: {
        tipper: {
          select: {
            id: true,
            username: true,
            imageUrl: true,
          },
        },
        stream: {
          select: {
            id: true,
            name: true,
            isLive: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: validated.limit,
      skip: validated.offset,
    });

    return { success: true, data: tips };
  } catch (err: any) {
    console.error("[getTips] error:", err);

    if (err instanceof z.ZodError) {
      throw new Error(err.errors[0]?.message || "Invalid input");
    }

    throw new Error(err.message || "Failed to fetch tips");
  }
}

/**
 * Get tip statistics for a streamer
 */
export async function getTipStats(data: z.infer<typeof getTipStatsSchema>) {
  try {
    const validated = getTipStatsSchema.parse(data);

    // Calculate time range
    let timeFilter: Date | undefined;
    switch (validated.timeRange) {
      case "24h":
        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "all":
      default:
        timeFilter = undefined;
        break;
    }

    const whereClause = {
      streamerId: validated.streamerId,
      ...(timeFilter && { createdAt: { gte: timeFilter } }),
    };

    // Get aggregated stats
    const [totalTips, totalAmount, tipCount] = await Promise.all([
      db.tip.count({ where: whereClause }),
      db.tip.aggregate({
        where: whereClause,
        _sum: { amount: true },
      }),
      db.tip.groupBy({
        by: ["tokenType"],
        where: whereClause,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    // Get recent tips
    const recentTips = await db.tip.findMany({
      where: whereClause,
      include: {
        tipper: {
          select: {
            id: true,
            username: true,
            imageUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    return {
      success: true,
      data: {
        totalTips,
        totalAmount: totalAmount._sum.amount || 0,
        tipCount,
        recentTips,
        timeRange: validated.timeRange,
      },
    };
  } catch (err: any) {
    console.error("[getTipStats] error:", err);

    if (err instanceof z.ZodError) {
      throw new Error(err.errors[0]?.message || "Invalid input");
    }

    throw new Error(err.message || "Failed to fetch tip statistics");
  }
}

/**
 * Mark a tip as processed (for withdrawal tracking)
 */
export async function markTipAsProcessed(tipId: string) {
  try {
    const self = await getSelf();

    const tip = await db.tip.update({
      where: {
        id: tipId,
        streamerId: self.id, // Only the streamer can mark their tips as processed
      },
      data: {
        isProcessed: true,
      },
    });

    return { success: true, data: tip };
  } catch (err: any) {
    console.error("[markTipAsProcessed] error:", err);
    throw new Error(err.message || "Failed to mark tip as processed");
  }
}
