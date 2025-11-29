"use client";

// import { Stream, User } from "@prisma/client";
import { LiveKitRoom } from "@livekit/components-react";

import { cn } from "@/lib/utils";
import { useChatSidebar } from "@/store/use-chat-sidebar";
import { useViewerToken } from "@/hooks/use-viewer-token";

import { InfoCard } from "./info-card";
import { AboutCard } from "./about-card";
import { ChatToggle } from "./chat-toggle";
import { Chat, ChatSkeleton } from "./chat";
import { Video, VideoSkeleton } from "./video";
import { Header, HeaderSkeleton } from "./header";
import { MobileStreamPlayerDetails } from "./mobile-stream-player-details";
import { MobileTipModal } from "./mobile-tip-modal";

export type CustomStream = {
  id: string;
  isChatEnabled: boolean;
  isChatDelayed: boolean;
  isChatFollowersOnly: boolean;
  isLive: boolean;
  thumbnailUrl: string | null;
  name: string;
};

export type CustomUser = {
  id: string;
  username: string;
  bio: string | null;
  stream: CustomStream | null;
  imageUrl: string;
  externalUserId: string;
  solanaWallet: string | null;
  _count: { followedBy: number };
};

interface StreamPlayerProps {
  user: CustomUser;
  stream: CustomStream;
  isFollowing: boolean;
}

export const StreamPlayer = ({
  user,
  stream,
  isFollowing,
}: StreamPlayerProps) => {
  const { token, name, identity } = useViewerToken(user.id);
  const { collapsed, isShowTipModal } = useChatSidebar((state) => state);

  if (!token || !name || !identity) {
    return <StreamPlayerSkeleton />;
  }

  return (
    <>
      {collapsed && (
        <div className="hidden lg:block fixed top-[100px] right-2 z-50">
          <ChatToggle />
        </div>
      )}
      <LiveKitRoom
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_WS_URL}
        className={cn(
          "grid grid-cols-1 lg:gap-y-0 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6 h-full",
          collapsed && "lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2"
        )}
      >
        <div className="space-y-4 col-span-1 lg:col-span-2 xl:col-span-2 2xl:col-span-5 lg:overflow-y-auto hidden-scrollbar md:pb-10">
          <Video
            hostName={user.username}
            hostIdentity={user.id}
            thumbnailUrl={stream.thumbnailUrl}
          />
          <div className="hidden md:flex md:flex-col md:gap-y-4">
            <Header
              hostName={user.username}
              hostIdentity={user.id}
              viewerIdentity={identity}
              imageUrl={user.imageUrl}
              isFollowing={isFollowing}
              name={stream.name}
            />
            <InfoCard
              hostIdentity={user.id}
              viewerIdentity={identity}
              name={stream.name}
              thumbnailUrl={stream.thumbnailUrl}
            />
            <AboutCard
              hostName={user.username}
              hostIdentity={user.id}
              viewerIdentity={identity}
              bio={user.bio}
              followedByCount={user._count.followedBy}
            />
          </div>
        </div>
        <div
          className={cn("col-span-1 hidden md:block", collapsed && "hidden")}
        >
          <Chat
            viewerName={name}
            hostName={user.username}
            hostIdentity={user.id}
            hostWalletAddress={user.solanaWallet || ""}
            isFollowing={isFollowing}
            isChatEnabled={stream.isChatEnabled}
            isChatDelayed={stream.isChatDelayed}
            isChatFollowersOnly={stream.isChatFollowersOnly}
            streamId={stream.id}
          />
        </div>

        <div className="col-span-1 block md:hidden">
          <MobileStreamPlayerDetails
            user={user}
            identity={identity}
            isFollowing={isFollowing}
            stream={stream}
            viewerName={name}
          />
        </div>

        {isShowTipModal && (
          <MobileTipModal
            hostIdentity={user.id}
            hostWalletAddress={user.solanaWallet || ""}
            streamerId={user.id}
            streamId={stream.id}
            onSendTip={(amount) => console.log(`Sending tip: ${amount}`)}
          />
        )}
      </LiveKitRoom>
    </>
  );
};

export const StreamPlayerSkeleton = () => {
  return (
    <div className="grid grid-cols-1 lg:gap-y-0 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6 h-full">
      <div className="space-y-4 col-span-1 lg:col-span-2 xl:col-span-2 2xl:col-span-5 lg:overflow-y-auto hidden-scrollbar md:pb-10">
        <VideoSkeleton />
        <HeaderSkeleton />
      </div>
      <div className="col-span-1 bg-background">
        <ChatSkeleton />
      </div>
    </div>
  );
};
