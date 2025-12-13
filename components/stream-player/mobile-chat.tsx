import React from "react";
import { CustomStream, CustomUser } from ".";
import { Chat } from "./chat";

interface MobileChatProps {
  user: CustomUser;
  isFollowing: boolean;
  stream: CustomStream;
  viewerName: string;
}

export const MobileChat = ({
  user,
  isFollowing,
  stream,
  viewerName,
}: MobileChatProps) => {
  return (
    <Chat
      viewerName={viewerName}
      hostName={user.username}
      hostIdentity={user.id}
      hostWalletAddress={user.solanaWallet || user.platformWallet || ""}
      isFollowing={isFollowing}
      isChatEnabled={stream.isChatEnabled}
      isChatDelayed={stream.isChatDelayed}
      isChatFollowersOnly={stream.isChatFollowersOnly}
      streamId={stream.id}
    />
  );
};
