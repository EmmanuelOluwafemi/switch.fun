"use client";

import { useCallback, useEffect, useMemo } from "react";
import { ConnectionState } from "livekit-client";
import { useMediaQuery } from "usehooks-ts";
import { useAtom } from "jotai";
import {
  useChat,
  useConnectionState,
  useRemoteParticipant,
  useRoomContext,
} from "@livekit/components-react";

import { ChatVariant, useChatSidebar } from "@/store/use-chat-sidebar";
import { useTipBroadcast, TipNotification } from "@/hooks/use-tip-broadcast";
import {
  reactionsAtom,
  streamTipNotificationsFamily,
  addReactionAtom,
  addStreamTipNotificationFamily,
  clearOldReactionsAtom,
  clearOldStreamTipNotificationsFamily,
  chatInputValueAtom,
} from "@/store/chat-atoms";

import { ChatForm } from "./chat-form";
import { ChatList, ChatListSkeleton } from "./chat-list";
import { ChatHeader, ChatHeaderSkeleton } from "./chat-header";
import { ChatCommunity } from "./chat-community";
import { TipComponent } from "./gift-chat";
import { TipNotifications } from "./tip-notification";
import { useUser } from "@civic/auth-web3/react";
import { cn } from "@/lib/utils";

interface ChatProps {
  hostName: string;
  hostIdentity: string;
  hostWalletAddress: string;
  viewerName: string;
  isFollowing: boolean;
  isChatEnabled: boolean;
  isChatDelayed: boolean;
  isChatFollowersOnly: boolean;
  streamId: string;
}

export const Chat = ({
  hostName,
  hostIdentity,
  hostWalletAddress,
  viewerName,
  isFollowing,
  isChatEnabled,
  isChatDelayed,
  isChatFollowersOnly,
  streamId,
}: ChatProps) => {
  const { user } = useUser();
  const matches = useMediaQuery("(max-width: 1024px)");
  const { variant, onExpand, onChangeVariant } = useChatSidebar(
    (state) => state
  );
  const connectionState = useConnectionState();
  const participant = useRemoteParticipant(hostIdentity);

  const isOnline = participant && connectionState === ConnectionState.Connected;
  const isHidden = !isChatEnabled || !isOnline;

  // Check if the current viewer is the host
  const isHost = viewerName === hostName;

  // Jotai atoms for state management
  const [value, setValue] = useAtom(chatInputValueAtom);
  const [reactions] = useAtom(reactionsAtom);

  // Use stream-scoped atoms (no filtering needed!)
  const [tipNotifications] = useAtom(streamTipNotificationsFamily(hostIdentity));
  const [, addReaction] = useAtom(addReactionAtom);
  const [, addTipNotification] = useAtom(addStreamTipNotificationFamily(hostIdentity));
  const [, clearOldReactions] = useAtom(clearOldReactionsAtom);
  const [, clearOldTipNotifications] = useAtom(clearOldStreamTipNotificationsFamily(hostIdentity));

  const { chatMessages: messages, send } = useChat();
  const room = useRoomContext();

  const handleTipNotification = useCallback((notification: TipNotification) => {
    addTipNotification(notification);
  }, [addTipNotification]);

  const { broadcastTip } = useTipBroadcast(room, handleTipNotification);

  useEffect(() => {
    if (matches) {
      onExpand();
    }
  }, [matches, onExpand]);

  // Cleanup old reactions and tip notifications periodically
  useEffect(() => {
    const interval = setInterval(() => {
      clearOldReactions();
      clearOldTipNotifications();
    }, 5000); // Clean up every 5 seconds

    return () => clearInterval(interval);
  }, [clearOldReactions, clearOldTipNotifications]);

  const reversedMessages = useMemo(() => {
    return messages.sort((a, b) => b.timestamp - a.timestamp);
  }, [messages]);

  const onSubmit = () => {
    if (!send) return;

    send(value);
    setValue("");
  };

  const onChange = (value: string) => {
    setValue(value);
  };

  const handleReact = (emoji: string) => {
    const x = Math.random() * 80 + 10;
    addReaction({ emoji, x });
  };

  return (
    <div className={cn("sticky top-[80px] flex flex-col bg-background md:border-l md:border-b pt-0 h-[calc(100vh-380px)] md:h-[calc(100vh-80px)]", !user && "h-[calc(100vh-460px)] md:h-[calc(100vh-140px)]")}>
      <ChatHeader />

      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute bottom-20 text-3xl animate-reaction"
            style={{
              left: `${reaction.x}%`,
              animation: "reaction 3s forwards",
            }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {variant === ChatVariant.CHAT && (
        <>
          <div className="flex-1 overflow-y-auto p-2">
            <TipNotifications notifications={tipNotifications} />
            <ChatList messages={reversedMessages} notifications={tipNotifications} isHidden={isHidden} />
          </div>
          <ChatForm
            onSubmit={onSubmit}
            onReact={handleReact}
            value={value}
            onChange={onChange}
            isHidden={isHidden}
            isFollowersOnly={isChatFollowersOnly}
            isDelayed={isChatDelayed}
            isFollowing={isFollowing}
            isHost={isHost}
          />
        </>
      )}
      {variant === ChatVariant.COMMUNITY && (
        <ChatCommunity
          viewerName={viewerName}
          hostName={hostName}
          isHidden={isHidden}
        />
      )}
      {variant === ChatVariant.GIFT && (
        <div className="hidden md:block">
          <TipComponent
            hostIdentity={hostIdentity}
            hostWalletAddress={hostWalletAddress}
            streamerId={hostIdentity}
            streamId={streamId}
            onClose={() => onChangeVariant(ChatVariant.CHAT)}
            onSendTip={(amount) => console.log(`Sending tip: ${amount}`)}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes reaction {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) scale(1.5);
            opacity: 0;
          }
        }
        .animate-reaction {
          animation: reaction 3s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export const ChatSkeleton = () => {
  return (
    <div className="flex flex-col border-l border-b pt-0 h-[calc(100vh-80px)] border-2">
      <ChatHeaderSkeleton />
      <ChatListSkeleton />
    </div>
  );
};
