"use server";

import { Stream } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getSelf } from "@/lib/auth-service";
import { getStreamByUserIdFromApi, updateStream as updateStreamService } from "@/lib/stream-service";

export const updateStream = async (values: Partial<Stream>) => {
  try {
    const self = await getSelf();
    const selfStream = await getStreamByUserIdFromApi(self.id);

    if (!selfStream) {
      throw new Error("Stream not found");
    }

    const validData = {
      thumbnailUrl: values.thumbnailUrl,
      name: values.name,
      isChatEnabled: values.isChatEnabled,
      isChatFollowersOnly: values.isChatFollowersOnly,
      isChatDelayed: values.isChatDelayed,
    };

    const stream = await updateStreamService(selfStream.id, validData);

    revalidatePath(`/u/${self.username}/chat`);
    revalidatePath(`/u/${self.username}`);
    revalidatePath(`/${self.username}`);

    return stream;
  } catch {
    throw new Error("Internal Error");
  };
};
