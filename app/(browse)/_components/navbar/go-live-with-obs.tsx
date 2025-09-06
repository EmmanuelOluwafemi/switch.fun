"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/app/(dashboard)/u/[username]/keys/_components/copy-button";
import { ConnectModal } from "@/app/(dashboard)/u/[username]/keys/_components/connect-modal";
import { getStreamData } from "@/app/actions/stream";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createIngress } from "@/actions/ingress";
import { IngressInput } from "livekit-server-sdk";
import { toast } from "sonner";
import Link from "next/link";

interface GoLiveWithOBSProps {
  user: {
    id: string;
    username?: string;
  } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const GoLiveWithOBS = ({
  user,
  open = false,
  onOpenChange,
}: GoLiveWithOBSProps) => {
  const [stream, setStream] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const fetchStreamData = async () => {
      if (!user?.id) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await getStreamData();

        if (result.error) {
          setError(result.error);
          setStream(null);
        } else if (result.stream) {
          setStream(result.stream);
          setError(null);
        } else {
          setError("No stream data available");
          setStream(null);
        }
      } catch (err) {
        console.error("Error fetching stream data:", err);
        setError("Failed to load stream data");
        setStream(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      fetchStreamData();
    }
  }, [user?.id, open]);

  const handleGenerateNewKey = useCallback(async () => {
    try {
      setIsLoading(true);
      const ingress = await createIngress(IngressInput.RTMP_INPUT);
      console.log("ingress", ingress);
      if (ingress) {
        const result = await getStreamData();
        console.log("result", result);
        if (result.stream) {
          setStream(result.stream);
          toast.success("New stream key generated");
        }
      }
    } catch (error) {
      console.error("Error generating new key:", error);
      toast.error("Failed to generate new key");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold font-sans">
            Stream Setup
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center p-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-muted-foreground">
                Loading stream data...
              </span>
            </div>
          </div>
        ) : error ? (
          <div className="text-destructive p-6 text-center">
            <AlertCircle className="h-5 w-5 mx-auto mb-2" />
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl bg-muted/60 p-4 flex items-start gap-x-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-foreground">
                  Before you go live:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Generate a stream key if you haven&apos;t already</li>
                  <li>Copy the server URL and stream key</li>
                  <li>Open OBS and go to Settings → Stream</li>
                  <li>Select &quot;Custom&quot; as the service</li>
                  <li>Paste the server URL and stream key</li>
                  <li>Click &quot;OK&quot; to save settings</li>
                  <li>Click &quot;Start Streaming&quot; in OBS</li>
                  <li>Return here and click &quot;Go to Stream Studio&quot;</li>
                </ol>
              </div>
            </div>

            {stream ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-muted p-6">
                  <div className="flex items-center gap-x-10">
                    <p className="font-semibold text-foreground shrink-0">
                      Server URL
                    </p>
                    <div className="space-y-2 w-full">
                      <div className="w-full flex items-center gap-x-2">
                        <Input
                          value={stream.serverUrl || ""}
                          disabled
                          placeholder="Server URL"
                        />
                        <CopyButton value={stream.serverUrl || ""} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-muted p-6">
                  <div className="flex items-start gap-x-10">
                    <p className="font-semibold text-foreground shrink-0">
                      Stream Key
                    </p>
                    <div className="space-y-2 w-full">
                      <div className="w-full flex items-center gap-x-2">
                        <Input
                          value={stream.streamKey || ""}
                          type="password"
                          disabled
                          placeholder="Stream key"
                        />
                        <CopyButton value={stream.streamKey || ""} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between gap-x-2">
                  <Button
                    variant="outline"
                    onClick={handleGenerateNewKey}
                    disabled={isLoading}
                  >
                    Generate New Key
                  </Button>
                  <Link href={`/u/${user?.username}`}>
                    <Button variant="primary" className="font-semibold">
                      Go to Stream Studio
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-6 text-center text-muted-foreground">
                  No stream data available
                </div>
                <div className="flex justify-end">
                  <ConnectModal />
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Export skeleton for loading states
export const GoLiveWithOBSSkeleton = () => (
  <div className="max-w-2xl space-y-6">
    <div className="h-8 bg-muted rounded animate-pulse" />
    <div className="space-y-4">
      <div className="h-32 bg-muted rounded-xl animate-pulse" />
      <div className="h-24 bg-muted rounded-xl animate-pulse" />
      <div className="h-24 bg-muted rounded-xl animate-pulse" />
      <div className="flex justify-between gap-2">
        <div className="h-10 bg-muted rounded animate-pulse flex-1" />
        <div className="h-10 bg-muted rounded animate-pulse flex-1" />
      </div>
    </div>
  </div>
);
