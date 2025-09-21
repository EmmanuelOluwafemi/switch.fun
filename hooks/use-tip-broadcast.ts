import { useEffect, useCallback, useRef } from "react";
import { useDataChannel } from "@livekit/components-react";
import { Room } from "livekit-client";
import {
  broadcastTipNotification,
  createTipBroadcastData,
  isTipNotification,
  formatTipMessage,
} from "@/lib/tip-broadcast";
import { toast } from "sonner";
import { TIP_CONFIG } from "@/lib/tip-config";

export interface TipNotification {
  id: string;
  amount: number;
  tokenType: "USDC" | "SOL";
  giftType?: string;
  giftName?: string;
  tipperUsername: string;
  tipperImageUrl: string;
  streamerUsername: string;
  timestamp: number;
  message: string;
  isLargeTip?: boolean;
  isMegaTip?: boolean;
}

/**
 * Hook for handling tip broadcasting and notifications
 */
export function useTipBroadcast(
  room: Room | null,
  onTipReceived?: (notification: TipNotification) => void
) {
  const { message } = useDataChannel();

  // Keep track of processed message IDs to prevent duplicates
  const processedMessageIds = useRef(new Set<string>());

  // Clear old message IDs periodically to prevent memory leaks
  useEffect(() => {
    const interval = setInterval(() => {
      if (processedMessageIds.current.size > 1000) {
        processedMessageIds.current.clear();
      }
    }, 300000); // Clear every 5 minutes

    return () => clearInterval(interval);
  }, []);

  // Broadcast a tip notification
  const broadcastTip = useCallback(
    async (tipData: any) => {
      if (!room) {
        console.error("No room available for tip broadcasting");
        return;
      }

      try {
        // Validate tip data before broadcasting
        if (
          !tipData ||
          !tipData.id ||
          !tipData.amount ||
          !tipData.tipper ||
          !tipData.streamer
        ) {
          console.error("Invalid tip data for broadcasting:", tipData);
          return;
        }

        const broadcastData = createTipBroadcastData(tipData);
        await broadcastTipNotification(room, broadcastData);
      } catch (error) {
        console.error("Failed to broadcast tip:", error);
        // Don't throw the error to prevent breaking the app
      }
    },
    [room]
  );

  // Handle incoming tip notifications with deduplication
  useEffect(() => {
    if (!message) return;

    try {
      const data = JSON.parse(new TextDecoder().decode(message.payload));

      if (isTipNotification(data)) {
        const tip = data.tip;

        // Validate tip data before processing
        if (
          !tip ||
          !tip.id ||
          !tip.amount ||
          !tip.tipperUsername ||
          !tip.streamerUsername
        ) {
          console.error("Invalid tip notification data:", tip);
          return;
        }

        // Check if we've already processed this message
        const messageId = `${tip.id}-${tip.timestamp}`;
        if (processedMessageIds.current.has(messageId)) {
          return;
        }

        // Mark this message as processed
        processedMessageIds.current.add(messageId);

        const isLargeTip = tip.amount >= TIP_CONFIG.LARGE_TIP_THRESHOLD;
        const isMegaTip = tip.amount >= TIP_CONFIG.MEGA_TIP_THRESHOLD;

        const notification: TipNotification = {
          id: tip.id,
          amount: tip.amount,
          tokenType: tip.tokenType,
          giftType: tip.giftType,
          giftName: tip.giftName,
          tipperUsername: tip.tipperUsername,
          tipperImageUrl: tip.tipperImageUrl || "",
          streamerUsername: tip.streamerUsername,
          timestamp: tip.timestamp,
          message: formatTipMessage(tip),
          isLargeTip,
          isMegaTip,
        };

        // Call the callback if provided
        try {
          if (onTipReceived) {
            onTipReceived(notification);
          }
        } catch (callbackError) {
          console.error("Error in tip received callback:", callbackError);
        }
      }
    } catch (error) {
      console.error("Failed to parse tip notification:", error);
    }
  }, [message]); // Remove onTipReceived from dependencies to prevent re-runs

  // Stable callback ref for onTipReceived to prevent effect re-runs
  const onTipReceivedRef = useRef(onTipReceived);
  useEffect(() => {
    onTipReceivedRef.current = onTipReceived;
  });

  return {
    broadcastTip,
    LARGE_TIP_THRESHOLD: TIP_CONFIG.LARGE_TIP_THRESHOLD,
    MEGA_TIP_THRESHOLD: TIP_CONFIG.MEGA_TIP_THRESHOLD,
  };
}
