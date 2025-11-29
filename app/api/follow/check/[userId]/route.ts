import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@civic/auth-web3/nextjs";
import { db } from "@/lib/db";
import { getCachedData } from "@/lib/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // Validate input
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 }
      );
    }

    // Get authenticated user
    let self;
    try {
      self = await getUser();
    } catch (err: any) {
      console.error("Civic Auth getUser failed:", err);
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }

    if (!self?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the database user from the external user ID
    const dbUser = await db.user.findUnique({
      where: { externalUserId: self.id },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    // Check if following with caching
    const isFollowing = await getCachedData({
      key: `following:${dbUser.id}:${userId}`,
      ttl: 60, // 1 minute (follow status can change)
      fetchFn: async () => {
        const otherUser = await db.user.findUnique({
          where: { id: userId },
        });

        if (!otherUser) {
          throw new Error("User not found");
        }

        if (otherUser.id === dbUser.id) {
          return true; // You're always "following" yourself
        }

        const existingFollow = await db.follow.findFirst({
          where: {
            followerId: dbUser.id,
            followingId: otherUser.id,
          },
        });

        return !!existingFollow;
      },
    });

    return NextResponse.json({ isFollowing });
  } catch (err: any) {
    console.error("[GET /api/follow/check/[userId]] error:", err);

    if (err.message === "User not found") {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to check follow status" },
      { status: 500 }
    );
  }
} 