import { headers } from "next/headers";
import { WebhookReceiver } from "livekit-server-sdk";

import { db } from "@/lib/db";

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const headerPayload = headers();
    const authorization = headerPayload.get("Authorization");

    if (!authorization) {
      console.error("LiveKit webhook: No authorization header");
      return new Response("No authorization header", { status: 400 });
    }

    const event = receiver.receive(body, authorization);
    
    // Enhanced debug logging for multi-streamer issues
    console.log("[LiveKit Webhook]", {
      event: event.event,
      ingressId: event.ingressInfo?.ingressId,
      roomName: event.ingressInfo?.roomName,
      participantIdentity: event.ingressInfo?.participantIdentity,
      participantName: event.ingressInfo?.participantName,
    });

    if (event.event === "ingress_started") {
      const stream = await db.stream.update({
        where: {
          ingressId: event.ingressInfo?.ingressId,
        },
        data: {
          isLive: true,
        },
      });
      console.log("[Webhook] Stream set to LIVE:", {
        ingressId: event.ingressInfo?.ingressId,
        streamId: stream.id,
        userId: stream.userId,
      });
    }

    if (event.event === "ingress_ended") {
      const stream = await db.stream.update({
        where: {
          ingressId: event.ingressInfo?.ingressId,
        },
        data: {
          isLive: false,
        },
      });
      console.log("[Webhook] Stream set to OFFLINE:", {
        ingressId: event.ingressInfo?.ingressId,
        streamId: stream.id,
        userId: stream.userId,
      });
    }

    // Always return success response for LiveKit
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("LiveKit webhook error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}