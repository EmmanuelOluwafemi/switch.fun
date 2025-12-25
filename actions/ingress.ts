"use server";

import {
  IngressAudioEncodingPreset,
  IngressInput,
  IngressClient,
  IngressVideoEncodingPreset,
  RoomServiceClient,
  type CreateIngressOptions,
} from "livekit-server-sdk";

import { TrackSource } from "livekit-server-sdk/dist/proto/livekit_models";

import { db } from "@/lib/db";
import { getSelf } from "@/lib/auth-service";
import { revalidatePath } from "next/cache";

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_API_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

const ingressClient = new IngressClient(process.env.LIVEKIT_API_URL!);

export const resetIngresses = async (hostIdentity: string) => {
  const ingresses = await ingressClient.listIngress({
    roomName: hostIdentity,
  });

  const rooms = await roomService.listRooms([hostIdentity]);

  console.log(`[resetIngresses] Found ${ingresses.length} ingresses for host ${hostIdentity}`);
  for (const ingress of ingresses) {
    if (ingress.ingressId) {
      // Debug log to see what we are getting
      console.log(`[resetIngresses] Inspecting ingress: ${ingress.ingressId}, room: ${ingress.roomName}, participant: ${ingress.participantIdentity}`);

      // Safety check: Only delete if it belongs to this user
      if (ingress.roomName === hostIdentity || ingress.participantIdentity === hostIdentity) {
        console.log(`[resetIngresses] Deleting ingress belonging to host: ${ingress.ingressId}`);
        await ingressClient.deleteIngress(ingress.ingressId);
      } else {
        console.warn(`[resetIngresses] SKIPPING deletion of ingress ${ingress.ingressId} - it does not match host ${hostIdentity}`);
      }
    }
  }

  for (const room of rooms) {
    if (room.name === hostIdentity) {
      console.log(`[resetIngresses] Deleting room: ${room.name}`);
      await roomService.deleteRoom(room.name);
    } else {
      console.warn(`[resetIngresses] SKIPPING deletion of room ${room.name} - it does not match host ${hostIdentity}`);
    }
  }
};

export const createIngress = async (ingressType: IngressInput) => {
  try {
    const self = await getSelf();

    await resetIngresses(self.id);

    const options: CreateIngressOptions = {
      name: self.username,
      roomName: self.id,
      participantName: self.username,
      participantIdentity: self.id,
    };

    if (ingressType === IngressInput.WHIP_INPUT) {
      options.bypassTranscoding = true;
    } else {
      options.video = {
        source: TrackSource.CAMERA,
        preset: IngressVideoEncodingPreset.H264_1080P_30FPS_3_LAYERS,
      };
      options.audio = {
        source: TrackSource.MICROPHONE,
        preset: IngressAudioEncodingPreset.OPUS_STEREO_96KBPS
      };
    };

    const ingress = await ingressClient.createIngress(
      ingressType,
      options,
    );

    if (!ingress) {
      throw new Error("LiveKit failed to create ingress - no response received");
    }

    if (!ingress.url || !ingress.streamKey) {
      throw new Error("LiveKit created ingress but did not provide URL or stream key");
    }

    // Debug logging for multi-streamer issues
    console.log("[createIngress] Success", {
      ingressId: ingress.ingressId,
      roomName: options.roomName,
      participantIdentity: options.participantIdentity,
      participantName: options.participantName,
      userId: self.id,
      username: self.username,
    });

    await db.stream.update({
      where: { userId: self.id },
      data: {
        ingressId: ingress.ingressId,
        serverUrl: ingress.url,
        streamKey: ingress.streamKey,
      },
    });

    revalidatePath(`/u/${self.username}/keys`);
    return ingress;
  } catch (error: any) {
    console.error("Error in createIngress:", error);

    // Provide more specific error messages
    if (error.message?.includes("LiveKit")) {
      throw error; // Re-throw our custom errors
    }

    if (error.code === "P2025") {
      throw new Error("Stream not found in database. Please contact support.");
    }

    throw new Error(error.message || "Failed to create stream ingress");
  }
};
