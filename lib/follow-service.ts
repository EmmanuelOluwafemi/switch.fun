import { db } from "@/lib/db";
import { getSelf } from "@/lib/auth-service";

export const getFollowedUsers = async () => {
  try {
    const self = await getSelf();

    const followedUsers = db.follow.findMany({
      where: {
        followerId: self.id,
        following: {
          blocking: {
            none: {
              blockedId: self.id,
            },
          },
        },
      },
      include: {
        following: {
          include: {
            stream: {
              select: {
                isLive: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          following: {
            stream: {
              isLive: "desc",
            },
          },
        },
        {
          createdAt: "desc",
        },
      ],
    });

    return followedUsers;
  } catch {
    return [];
  }
};

export const isFollowingUser = async (id: string) => {
  try {
    const self = await getSelf();

    const otherUser = await db.user.findUnique({
      where: { id },
    });

    if (!otherUser) {
      throw new Error("User not found");
    }

    if (otherUser.id === self.id) {
      return true;
    }

    const existingFollow = await db.follow.findFirst({
      where: {
        followerId: self.id,
        followingId: otherUser.id,
      },
    });

    return !!existingFollow;
  } catch {
    return false;
  }
};

export const followUser = async (id: string) => {
  const self = await getSelf();

  const otherUser = await db.user.findUnique({
    where: { id },
  });

  if (!otherUser) {
    throw new Error("User not found");
  }

  if (otherUser.id === self.id) {
    throw new Error("Cannot follow yourself");
  }

  const existingFollow = await db.follow.findFirst({
    where: {
      followerId: self.id,
      followingId: otherUser.id,
    },
  });

  if (existingFollow) {
    throw new Error("Already following");
  }

  const follow = await db.follow.create({
    data: {
      followerId: self.id,
      followingId: otherUser.id,
    },
    include: {
      following: true,
      follower: true,
    },
  });

  return follow;
};

export const unfollowUser = async (id: string) => {
  const self = await getSelf();

  const otherUser = await db.user.findUnique({
    where: {
      id,
    },
  });

  if (!otherUser) {
    throw new Error("User not found");
  }

  if (otherUser.id === self.id) {
    throw new Error("Cannot unfollow yourself");
  }

  const existingFollow = await db.follow.findFirst({
    where: {
      followerId: self.id,
      followingId: otherUser.id,
    },
  });

  if (!existingFollow) {
    throw new Error("Not following");
  }

  const follow = await db.follow.delete({
    where: {
      id: existingFollow.id,
    },
    include: {
      following: true,
    },
  });

  return follow;
};

export const getFollowingFromApi = async () => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = baseUrl + "/api/follow/following";

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch following");
  }

  return response.json();
};

export const checkFollowStatusFromApi = async (userId: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = baseUrl + "/api/follow/check/" + userId;

  try {
    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Follow check failed for user " + userId + ":", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return { isFollowing: false };
    }

    return response.json();
  } catch (error) {
    console.error(
      "Error in checkFollowStatusFromApi for user " + userId + ":",
      error
    );
    return { isFollowing: false };
  }
};
