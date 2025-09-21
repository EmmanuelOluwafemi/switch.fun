"use client";

import { Loader2 } from "lucide-react";
import { useUser } from "@civic/auth-web3/react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import GoLive from "./goLive";
import { UpdateUserProfileModal } from "./update-profile-modal";
import { ActivatePlatformWalletModal } from "./activate-platform-wallet-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileDropdown } from "./profile-dropdown";
import { useSelf } from "@/hooks/use-self";
// const log = console.log;

export const Actions = () => {
  const [loading, setLoading] = useState(false);
  const [openUsernameModal, setOpenUsernameModal] = useState(false);
  const [openPlatformWalletModal, setOpenPlatformWalletModal] = useState(false);
  const [showPlatformWalletAfterProfile, setShowPlatformWalletAfterProfile] = useState(false);
  const { signIn, user } = useUser();

  const { data: currentUser, isLoading, isError, refetch } = useSelf();

  // Handle modal opening logic
  useEffect(() => {
    // If we have a Civic user, check what needs to be done
    if (!isLoading && user) {
      
      // Check if this is a new user response or existing user needing profile completion
      const isNewUser = currentUser && (currentUser as any).isNewUser;
      const needsProfileCompletion = isNewUser || 
        !currentUser || 
        !currentUser.username?.trim() || 
        !currentUser.interests?.length;
      
      if (needsProfileCompletion) {
        setOpenUsernameModal(true);
        setOpenPlatformWalletModal(false);
        setShowPlatformWalletAfterProfile(false);
      } 
      // Second priority: check if user needs platform wallet (from API or after profile completion)
      else if ((currentUser as any)?.needsPlatformWallet || showPlatformWalletAfterProfile) {
        setOpenUsernameModal(false);
        setOpenPlatformWalletModal(true);
        setShowPlatformWalletAfterProfile(false); // Reset the flag
      }
      // All good, close any open modals
      else {
        setOpenUsernameModal(false);
        setOpenPlatformWalletModal(false);
        setShowPlatformWalletAfterProfile(false);
      }
    }
  }, [currentUser, isLoading, isError, showPlatformWalletAfterProfile, user]);

  // Handle profile completion success
  const handleProfileCompleted = useCallback(() => {
    setShowPlatformWalletAfterProfile(true);
    refetch(); // Refresh user data
  }, [refetch]);

  // 👉 2️⃣ Handle the "Login" button
  async function handleLogin() {
    setLoading(true);
    try {
      await signIn();
      refetch();
    } catch (error) {
      console.error("Error signing in:", error);
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return <Skeleton className="w-12 h-6" />;
  }

  if (!user) {
    return (
      <Button
        variant="outline"
        className="text-sm"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          "Login"
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-x-6 ml-4 lg:ml-0">
      {!!currentUser && (
        <GoLive
          user={{
            id: currentUser?.id ?? "",
            username: currentUser?.username ?? "",
          }}
        />
      )}
      {!!currentUser && (
        <div className="flex items-center gap-x-4">
          <ProfileDropdown
            currentUser={{
              id: currentUser?.id ?? "",
              username: currentUser?.username ?? "",
              picture: currentUser?.imageUrl ?? "",
              wallet: currentUser?.solanaWallet ?? "",
            }}
            refetch={refetch}
          />
        </div>
      )}

      <UpdateUserProfileModal
        open={openUsernameModal}
        setOpen={setOpenUsernameModal}
        currentUser={{
          id: currentUser?.id ?? user?.id ?? "",
          username: currentUser?.username ?? "",
          picture: currentUser?.imageUrl ?? (currentUser as any)?.imageUrl ?? user?.picture ?? "",
          interests: currentUser?.interests ?? [],
        }}
        onProfileCompleted={handleProfileCompleted}
      />

      <ActivatePlatformWalletModal
        open={openPlatformWalletModal}
        setOpen={setOpenPlatformWalletModal}
        currentUser={{
          id: currentUser?.id ?? "",
          username: currentUser?.username ?? "",
        }}
        onSuccess={() => {
          refetch();
        }}
      />
    </div>
  );
};
