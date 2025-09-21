"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSelf } from "@/lib/auth-service";
import { getUser } from "@civic/auth-web3/nextjs";
import { invalidateUserCache } from "@/lib/user-service";
import { getCachedData } from "@/lib/redis";
// Platform wallet creation is now handled through the modal flow

// Input validation schemas
const createUserSchema = z.object({
  externalUserId: z.string().min(1, "External user ID is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
  imageUrl: z.string().optional(),
  solanaWallet: z.string().optional(),
  interests: z.array(z.string()).min(3, "At least 3 interests are required").max(8, "Maximum 8 interests allowed").optional(),
});

const updateUserSchema = z.object({
  id: z.string().min(1),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    )
    .optional(),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  solanaWallet: z.string().optional(),
  interests: z.array(z.string()).min(3, "At least 3 interests are required").max(8, "Maximum 8 interests allowed").optional(),
});

// Rate limiting helper
const rateLimitKey = (userId: string, action: string) =>
  `rate_limit:${action}:${userId}`;

async function checkRateLimit(
  userId: string,
  action: string,
  limit: number = 5,
  window: number = 300
) {
  const key = rateLimitKey(userId, action);
  const current = await getCachedData({
    key,
    ttl: window,
    fetchFn: async () => 0,
  });

  if (current >= limit) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }

  // Increment counter
  await getCachedData({
    key,
    ttl: window,
    fetchFn: async () => (current as number) + 1,
  });
}

// ————————————————
// Create a brand‑new user
// ————————————————
export const createUser = async (data: {
  externalUserId: string;
  username: string;
  imageUrl: string;
  solanaWallet?: string;
  interests?: string[];
}) => {
  try {
    // Validate input
    const validatedData = createUserSchema.parse(data);

    // Check if username is already taken
    const existingUser = await db.user.findFirst({
      where: {
        username: {
          equals: validatedData.username.toLowerCase(),
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      throw new Error("Username is already taken");
    }

    // Create user with transaction for atomicity
    const user = await db.$transaction(async (tx) => {
      // Create user first
      const newUser = await tx.user.create({
        data: {
          externalUserId: validatedData.externalUserId,
          username: validatedData.username.toLowerCase(),
          imageUrl: validatedData.imageUrl || "https://i.postimg.cc/wxGCZ9Qy/Frame-12.png",
          solanaWallet: validatedData.solanaWallet,
          stream: {
            create: {
              name: `${validatedData.username.toLowerCase()}'s stream`,
            },
          },
        },
        include: {
          stream: true,
        },
      });

      // Create interests if provided
      if (validatedData.interests && validatedData.interests.length > 0) {
        await tx.userInterest.createMany({
          data: validatedData.interests.map((subCategoryId: string) => ({
            userId: newUser.id,
            subCategoryId,
          })),
          skipDuplicates: true,
        });
      }

      return newUser;
    });

    // Fetch the complete user data after transaction
    const completeUser = await db.user.findUnique({
      where: { id: user.id },
      include: {
        stream: true,
        interests: {
          include: {
            subCategory: true,
          },
        },
      },
    });

    if (!completeUser) {
      throw new Error("Failed to create user");
    }

    // Platform wallet will be created through the modal flow when user logs in

    // Batch revalidate paths
    const pathsToRevalidate = [
      `/u/${completeUser.username}`,
      `/@${completeUser.username}`,
      "/", // Home page to show new user
    ];

    await Promise.all(pathsToRevalidate.map((path) => revalidatePath(path)));

    return completeUser;
  } catch (err: any) {
    console.error("[createUser] error:", err);

    // Return user-friendly error messages
    if (err instanceof z.ZodError) {
      throw new Error(err.errors[0]?.message || "Invalid input data");
    }

    if (err.message.includes("Unique constraint")) {
      throw new Error("Username or external ID already exists");
    }

    throw new Error(err.message || "Failed to create user");
  }
};

// ————————————————
// Update an existing user's username or bio
// ————————————————
export const updateUser = async (values: {
  id: string;
  username?: string;
  bio?: string;
  solanaWallet?: string;
  interests?: string[];
}) => {
  try {
    
    // Validate input
    const validatedValues = updateUserSchema.parse(values);

    // Get raw Civic user data for new user creation scenarios
    let civicUser;
    try {
      civicUser = await getUser();
    } catch (err: any) {
      console.error("Civic Auth getUser failed:", err);
      throw new Error("Authentication failed");
    }
    if (!civicUser?.id) {
      throw new Error("Unauthorized");
    }
    await checkRateLimit(civicUser.id, "update_user", 10, 300); // 10 updates per 5 minutes

    // Check if this is a new user (Civic user but no database record)
    // The ID passed might be the Civic user ID, so check by externalUserId
    const existingDbUser = await db.user.findUnique({
      where: { externalUserId: civicUser.id },
      include: {
        interests: {
          include: {
            subCategory: true,
          },
        },
      },
    });
    
    // If no database user exists, this is a new user creation
    if (!existingDbUser) {
      const newUserData = {
        externalUserId: civicUser.id,
        username: validatedValues.username!,
        imageUrl: civicUser.picture || "https://i.postimg.cc/wxGCZ9Qy/Frame-12.png",
        solanaWallet: validatedValues.solanaWallet,
        interests: validatedValues.interests,
      };
      
      const createdUser = await createUser(newUserData);
      return createdUser;
    }
    

    // Use the existing database user for updates (we already have the user data)
    const self = existingDbUser;

    const updateData: { username?: string; bio?: string; solanaWallet?: string } = {};

    // Check if username is available before updating
    if (validatedValues.username) {
      const existingUser = await db.user.findFirst({
        where: {
          username: {
            equals: validatedValues.username.toLowerCase(),
            mode: "insensitive",
          },
          NOT: { id: self.id },
        },
      });

      if (existingUser) {
        throw new Error("Username is already taken");
      }

      updateData.username = validatedValues.username.toLowerCase();
    }

    if (validatedValues.bio !== undefined) {
      updateData.bio = validatedValues.bio;
    }

    if (validatedValues.solanaWallet !== undefined) {
      updateData.solanaWallet = validatedValues.solanaWallet;
    }

    // Use transaction for atomic update with timeout
    await db.$transaction(async (tx) => {
      // Update user basic info if needed
      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: self.id },
          data: updateData,
        });

        // If setting username for first time (user had empty username), update stream name
        if (updateData.username && (!self.username || self.username === "")) {
          await tx.stream.updateMany({
            where: { userId: self.id },
            data: {
              name: `${updateData.username}'s stream`,
            },
          });
        }
      }

      // Handle interests update separately
      if (validatedValues.interests !== undefined) {
        // Delete existing interests first
        await tx.userInterest.deleteMany({
          where: { userId: self.id },
        });

        // Create new interests if any
        if (validatedValues.interests.length > 0) {
          await tx.userInterest.createMany({
            data: validatedValues.interests.map((subCategoryId) => ({
              userId: self.id,
              subCategoryId,
            })),
            skipDuplicates: true,
          });
        }
      }
    }, {
      maxWait: 15000, // 15 second timeout
      timeout: 20000, // 20 second timeout
    });

    // Fetch the updated user after transaction completes
    let updatedUser = await db.user.findUnique({
      where: { id: self.id },
      include: {
        stream: true,
        interests: {
          include: {
            subCategory: true,
          },
        },
        _count: {
          select: {
            followedBy: true,
          },
        },
      },
    });

    if (!updatedUser) {
      // Create new user combining Civic data + Profile form data
      updatedUser = await db.$transaction(async (tx) => {
        // 1. Create user with stream (Civic data + Form data)
        const createdUser = await tx.user.create({
          data: {
            externalUserId: civicUser.id, // From Civic
            username: validatedValues.username!, // From form
            imageUrl: civicUser.picture || "https://i.postimg.cc/wxGCZ9Qy/Frame-12.png", // From Civic
            solanaWallet: validatedValues.solanaWallet, // From form
            stream: {
              create: {
                name: `${validatedValues.username}'s Stream`, // From form
              },
            },
          },
        });

        // 2. Create user interests (From form)
        if (validatedValues.interests && validatedValues.interests.length > 0) {
          await tx.userInterest.createMany({
            data: validatedValues.interests.map((subCategoryId) => ({
              userId: createdUser.id,
              subCategoryId,
            })),
          });
        }

        // 3. Return complete user with all relationships
        return await tx.user.findUnique({
          where: { id: createdUser.id },
          include: {
            stream: true,
            interests: {
              include: {
                subCategory: true,
              },
            },
            _count: {
              select: {
                followedBy: true,
                following: true,
              },
            },
          },
        });
      });
      
    }

    // Ensure updatedUser exists before proceeding
    if (!updatedUser) {
      throw new Error("Failed to create or fetch user after update operation");
    }

    // Platform wallet will be created through the modal flow when needed

    // Batch cache invalidation and path revalidation
    const cacheInvalidations = [invalidateUserCache(updatedUser.id, updatedUser.username)];

    const pathsToRevalidate = [
      `/u/${updatedUser.username}`,
      `/@${updatedUser.username}`,
    ];

    if (validatedValues.username) {
      cacheInvalidations.push(
        invalidateUserCache(updatedUser.id, validatedValues.username)
      );
      pathsToRevalidate.push(`/u/${updatedUser.username}`, `/@${updatedUser.username}`);
    }

    // Execute all operations in parallel
    await Promise.all([
      ...cacheInvalidations,
      ...pathsToRevalidate.map((path) => revalidatePath(path)),
    ]);

    return updatedUser;
  } catch (err: any) {
    console.error("[updateUser] error:", err);

    if (err instanceof z.ZodError) {
      throw new Error(err.errors[0]?.message || "Invalid input data");
    }

    throw new Error(err.message || "Failed to update user");
  }
};


