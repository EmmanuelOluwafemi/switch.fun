"use client";

import { useCallback } from "react";
import { ConnectionState, Track } from "livekit-client";
import { useAtom } from "jotai";
import {
  useConnectionState,
  useRemoteParticipant,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";

import { Skeleton } from "@/components/ui/skeleton";
import { TipOverlayManager } from "./tip-overlay";
import { GiftTipOverlayManager } from "./gift-tip-overlay";
import { TipNotification } from "@/hooks/use-tip-broadcast";
import {
  streamLargeTipsFamily,
  streamGiftTipsFamily,
  removeStreamTipNotificationFamily,
} from "@/store/chat-atoms";

import { OfflineVideo } from "./offline-video";
import { LoadingVideo } from "./loading-video";
import { LiveVideo } from "./live-video";

interface VideoProps {
  hostName: string;
  hostIdentity: string;
  thumbnailUrl?: string | null;
}

export const Video = ({ hostName, hostIdentity, thumbnailUrl }: VideoProps) => {
  const connectionState = useConnectionState();
  const participant = useRemoteParticipant(hostIdentity);
  const room = useRoomContext();

  // Use stream-scoped atoms (no filtering needed!)
  const [largeTips] = useAtom(streamLargeTipsFamily(hostIdentity));
  const [giftTips] = useAtom(streamGiftTipsFamily(hostIdentity));
  const [, removeNotification] = useAtom(removeStreamTipNotificationFamily(hostIdentity));

  const tracks = useTracks([
    Track.Source.Camera,
    Track.Source.Microphone,
  ]).filter((track) => track.participant.identity === hostIdentity);

  // Note: Tip notifications are handled by the Chat component via useTipBroadcast
  // The Video component only consumes the notifications from stream-scoped atoms
  // This prevents duplicate tip notifications and ensures stream isolation

  const handleNotificationComplete = useCallback(
    (id: string) => {
      removeNotification(id);
    },
    [removeNotification]
  );

  let content;

  if (!participant && connectionState === ConnectionState.Connected) {
    content = <OfflineVideo username={hostName} />;
  } else if (!participant || tracks.length === 0) {
    // content = <LoadingVideo label={connectionState} />
    content = <OfflineVideo username={hostName} thumbnailUrl={thumbnailUrl} />;
  } else {
    content = <LiveVideo participant={participant} />;
  }

  return (
    <div className="aspect-video border-b border-border/40 group relative">
      {content}

      {/* 
        Overlay Priority System:
        1. Large/Mega Tips (z-50): Always take priority, includes gift info if applicable
        2. Regular Gift Tips (z-40): Only show for non-large/non-mega gift tips
        
        This prevents conflicts where a large gift tip would show both overlays
      */}

      {/* Large/Mega tip overlay - HIGHEST PRIORITY (z-50) */}
      <TipOverlayManager
        notifications={largeTips}
        onNotificationComplete={handleNotificationComplete}
      />

      {/* Regular gift tip overlay - LOWER PRIORITY (z-40) */}
      <GiftTipOverlayManager
        notifications={giftTips}
        onNotificationComplete={handleNotificationComplete}
      />
    </div>
  );
};

export const VideoSkeleton = () => {
  return (
    <div className="aspect-video border-x border-background">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  );
};
