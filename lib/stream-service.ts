import { Stream } from "@prisma/client"
import { db } from "@/lib/db"

export async function getStreamByUserId(userId: string) {
  return db.stream.findUnique({
    where: { userId }
  })
}

export async function getStreamByUsername(username: string) {
  return db.user.findUnique({
    where: { username },
    select: { id: true }
  })
}

export async function updateStream(streamId: string, data: Partial<Stream>) {
  const stream = await db.stream.update({
    where: { id: streamId },
    data
  })

  return stream
}

export const getStreamByUserIdFromApi = async (userId: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const url = baseUrl ? `${baseUrl}/api/stream/user/${userId}` : `/api/stream/user/${userId}`;

  const response = await fetch(url, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error("Failed to fetch stream");
  }

  return response.json();
};

export const getStreamByUsernameFromApi = async (username: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const url = baseUrl ? `${baseUrl}/api/stream/username/${username}` : `/api/stream/username/${username}`;

  const response = await fetch(url, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error("Failed to fetch stream");
  }

  return response.json();
};
