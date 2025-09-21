import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import React, { useState, useCallback } from "react";
import { useUser } from "@civic/auth-web3/react";
import { userHasWallet } from "@civic/auth-web3";
import { Wallet, Shield, Zap } from "lucide-react";

interface ActivatePlatformWalletModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  currentUser: {
    id: string;
    username: string;
  };
  onSuccess: () => void;
}

export const ActivatePlatformWalletModal = React.memo(
  ({
    open,
    setOpen,
    currentUser,
    onSuccess,
  }: ActivatePlatformWalletModalProps) => {
    const userContext = useUser();
    const hasWallet = userHasWallet(userContext);
    const solanaWallet =
      hasWallet && userContext.solana ? userContext.solana.address : undefined;

    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleActivatePlatformWallet = useCallback(async () => {
      if (!solanaWallet) {
        setError("Please connect your wallet first");
        return;
      }

      setIsActivating(true);
      setError(null);

      try {
        // Step 1: Create platform wallet transaction
        const createResponse = await fetch("/api/wallet/platform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenMint: "2o39Cm7hzaXmm9zGGGsa5ZiveJ93oMC2D6U7wfsREcCo", // Your token mint
            userPublicKey: solanaWallet,
          }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to create platform wallet transaction");
        }

        const { serializedTransaction } = await createResponse.json();

        // Step 2: Access the actual wallet for signing
        // @ts-ignore
        const wallet = userContext?.solana.wallet;
        if (!wallet) {
          throw new Error("No wallet available for signing");
        }

        // Temporarily close our modal to allow Civic modal to be interactive
        setOpen(false);

        // Try to sign the transaction using the wallet
        let signedTransaction;

        if (wallet.signTransaction) {
          const { Transaction } = await import("@solana/web3.js");
          const transaction = Transaction.from(
            Buffer.from(serializedTransaction, "base64")
          );

          signedTransaction = await wallet.signTransaction(transaction);
        } else if (wallet.signAllTransactions) {
          const { Transaction } = await import("@solana/web3.js");
          const transaction = Transaction.from(
            Buffer.from(serializedTransaction, "base64")
          );
          const signedTransactions = await wallet.signAllTransactions([
            transaction,
          ]);
          signedTransaction = signedTransactions[0];
        } else {
          throw new Error(
            "Wallet does not support transaction signing. Available methods: " +
              Object.keys(wallet).join(", ")
          );
        }

        // Step 3: Send signed transaction back to platform for broadcasting
        const completeResponse = await fetch("/api/wallet/platform", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userSignedTransaction: Buffer.from(
              signedTransaction.serialize()
            ).toString("base64"),
            userPublicKey: solanaWallet,
          }),
        });

        if (!completeResponse.ok) {
          throw new Error("Failed to complete platform wallet activation");
        }

        const result = await completeResponse.json();

        // Success! Modal is already closed, just trigger refresh
        onSuccess();
      } catch (err: any) {
        console.error("Platform wallet activation failed:", err);
        setError(err.message || "Failed to activate platform wallet");
        // Reopen modal to show error
        setOpen(true);
      } finally {
        setIsActivating(false);
      }
      // @ts-ignore
    }, [solanaWallet, userContext.solana?.signTransaction, setOpen, onSuccess]);

    return (
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogClose />
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold font-sans flex items-center justify-center gap-2">
              <Wallet className="w-6 h-6" />
              Activate Platform Wallet
            </DialogTitle>
            <DialogDescription className="text-center">
              To enable full platform features like tipping and streaming
              rewards, you need to activate your platform wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Shield className="w-5 h-5 text-blue-500" />
                <div className="text-sm">
                  <div className="font-medium">Secure & Free</div>
                  <div className="text-muted-foreground">
                    You sign, we broadcast
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Zap className="w-5 h-5 text-green-500" />
                <div className="text-sm">
                  <div className="font-medium">No Gas Fees</div>
                  <div className="text-muted-foreground">
                    Platform covers transaction costs
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {(!hasWallet || !userContext.solana) && (
              <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm">
                Please connect your wallet to activate platform features.
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="w-full"
              disabled={isActivating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleActivatePlatformWallet}
              disabled={!hasWallet || !userContext.solana || isActivating}
              className="w-full"
            >
              {isActivating ? "Activating..." : "Activate Platform Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ActivatePlatformWalletModal.displayName = "ActivatePlatformWalletModal";
