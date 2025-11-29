"use client";

import { useMemo } from "react";
import { Share2, UserIcon } from "lucide-react";
import {
  useParticipants,
  useRemoteParticipant,
} from "@livekit/components-react";
import { toast, Toaster } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedMark } from "@/components/verified-mark";
import { UserAvatar, UserAvatarSkeleton } from "@/components/user-avatar";
import { useUser } from "@civic/auth-web3/react";

import { Actions, ActionsSkeleton } from "./actions";
// import WalletQRButton from "../tip-me/WalletQRButton";
import { Button } from "../ui/button";

interface HeaderProps {
  imageUrl: string;
  hostName: string;
  hostIdentity: string;
  viewerIdentity: string;
  isFollowing: boolean;
  name: string;
}

export const Header = ({
  imageUrl,
  hostName,
  hostIdentity,
  viewerIdentity,
  isFollowing,
}: HeaderProps) => {
  const participants = useParticipants();
  const participant = useRemoteParticipant(hostIdentity);
  const { user: currentUser } = useUser();

  const isLive = !!participant;
  const participantCount = useMemo(() => {
    return participants.filter(
      (participant) =>
        participant.identity !== hostIdentity &&
        participant.identity !== `host-${hostIdentity}`
    ).length;
  }, [participants, hostIdentity]);

  const hostAsViewer = `host-${hostIdentity}`;
  const isHost = viewerIdentity === hostAsViewer;

  // Construct the share message:
  const shareText = `Join my livestream and get to interact with me live—let's connect: ${window.location.href}`;

  const handleShareClick = async () => {
    // If Web Share API is available (mobile browsers & some desktops)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Live now: ${hostName}'s stream`,
          text: `Join my livestream and get to interact with me live—let's connect:`,
          url: window.location.href,
        });
        toast.success("Share dialog opened");
      } catch (err) {
        // User probably canceled the share dialog. No need to do anything.
        console.error("Share canceled or failed:", err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        toast.success("Copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy:", err);
        toast.error("Failed to copy link");
      }
    }
  };

  return (
    <>
      {/* Render Toaster once per page (ideally at root, but including here for demonstration) */}
      <Toaster position="top-right" />
      <div className="flex flex-col lg:flex-row gap-y-4 lg:gap-y-0 items-start justify-between px-4">
        <div className="flex items-center gap-x-3">
          <UserAvatar
            imageUrl={imageUrl}
            username={hostName}
            size="md"
            isLive={isLive}
            showBadge
          />
          <div className="space-y-1">
            <div className="flex items-center gap-x-2">
              <h2 className="text-lg font-semibold font-sans">{hostName}</h2>
              <VerifiedMark />
            </div>
            {/* <p className="text-sm font-semibold">{name}</p> */}
            {isLive ? (
              <div className="font-semibold flex gap-x-1 items-center text-xs text-rose-500">
                <UserIcon className="h-4 w-4" />
                <p>
                  {participantCount}{" "}
                  {participantCount === 1 ? "viewer" : "viewers"}
                </p>
              </div>
            ) : (
              <p className="font-semibold text-xs text-muted-foreground">
                Offline
              </p>
            )}
          </div>
        </div>
        {/* <WalletQRButton /> */}
        {/* ←––– "Share Stream" button with Sonner toast –––→ */}
        <div className="flex items-center gap-x-2">
          <Button
            onClick={handleShareClick}
            variant="outline"
            size="sm"
            className="flex items-center"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
        {/* ←––– End Share button –––→ */}
        {/* ←––– End Share button –––→ */}
        {
          !!currentUser && (
            <Actions
              isFollowing={isFollowing}
              hostIdentity={hostIdentity}
              isHost={isHost}
            />
          )
        }
      </div>
    </>
  );
};

export const HeaderSkeleton = () => {
  return (
    <div className="flex flex-col lg:flex-row gap-y-4 lg:gap-y-0 items-start justify-between px-4">
      <div className="flex items-center gap-x-2">
        <UserAvatarSkeleton size="lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      <ActionsSkeleton />
    </div>
  );
};
