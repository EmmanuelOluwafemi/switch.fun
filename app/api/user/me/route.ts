import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@civic/auth-web3/nextjs";
import { db } from "@/lib/db";
import { z } from "zod";
import { verifyStreamerAccountExists } from "@/lib/platform-wallet";

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from Civic
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database with caching
    const user = await db.user.findUnique({
      where: { externalUserId: self.id },
      include: {
        interests: {
          include: {
            subCategory: true,
          },
        },
        stream: true,
        _count: {
          select: {
            followedBy: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      // User doesn't exist in database - this is a new user from Civic
      // Return a special response indicating profile completion is needed
      return NextResponse.json({
        isNewUser: true,
        externalUserId: self.id,
        imageUrl: self.picture || "https://i.postimg.cc/wxGCZ9Qy/Frame-12.png",
        needsProfileCompletion: true,
        message: "Profile completion required for new user"
      }, { status: 202 }); // 202 Accepted - indicates further action needed
    }

    // Check if existing user needs platform wallet creation
    if (user && !user.isSolanaPlatformWallet) {
      // Add a flag to response indicating platform wallet setup is needed
      return NextResponse.json({
        ...user,
        needsPlatformWallet: true,
        message: "Platform wallet setup required for full functionality",
      });
    }

    return NextResponse.json(user);
  } catch (err: any) {
    console.error("[GET /api/user/me] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

const updateWalletSchema = z.object({
  solanaWallet: z.string().min(1, "Solana wallet address is required"),
});

export async function PATCH(request: NextRequest) {
  try {
    // Get authenticated user from Civic
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validatedData = updateWalletSchema.parse(body);

    // Update user's solana wallet
    const updatedUser = await db.user.update({
      where: { externalUserId: self.id },
      data: { solanaWallet: validatedData.solanaWallet },
      select: {
        id: true,
        username: true,
        solanaWallet: true,
      },
    });

    return NextResponse.json({
      message: "Solana wallet updated successfully",
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("[PATCH /api/user/me] error:", err);

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.errors[0]?.message || "Invalid input data" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
