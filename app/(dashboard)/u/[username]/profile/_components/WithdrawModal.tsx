"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { userHasWallet } from "@civic/auth-web3";
import { useUser, useWallet } from "@civic/auth-web3/react";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Wallet, ArrowDownCircle } from "lucide-react";
import { usePrices } from "./usePrices";
import { withdraw } from "./withdrawalService";
import { getProgram } from "@/utils/program";
// import { Wallet as WalletType } from "@coral-xyz/anchor";
import { toast } from "sonner";
import { supportedTokens } from "@/config/wallet.js";

// USDC Token mint (6 decimals)
const USDC_MINT = new PublicKey(supportedTokens.contractAddress);
const USDC_DECIMALS = 6;

interface WalletBalance {
  address: string;
  balance: number;
  type: "platform" | "normal";
  displayName: string;
}

interface WithdrawModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export default function WithdrawModal({ open, setOpen }: WithdrawModalProps) {
  const userContext = useUser();
  const { wallet, address: solAddress } = useWallet({ type: "solana" });
  const hasWallet = userHasWallet(userContext);
  const userAddress = hasWallet ? userContext.solana.address : "";
  const { prices } = usePrices();

  // Network and connection
  const network =
    process.env.NEXT_PUBLIC_USE_MAINNET === "true" ? "mainnet-beta" : "devnet";
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const connection = useMemo(() => new Connection(endpoint), [endpoint]);

  // State
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletBalance | null>(
    null
  );
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gasFee, setGasFee] = useState<number>(0);

  // Calculate platform wallet PDA
  const platformWalletPDA = useMemo(() => {
    if (!hasWallet || !userAddress) return null;

    try {
      // This should match your program's user state PDA derivation
      // Adjust the seeds based on your actual program logic

      let program = getProgram(connection, wallet as unknown as any);
      const programId = program.programId;
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user"), new PublicKey(userAddress).toBuffer()],
        programId
      );
      return pda;
    } catch (err) {
      console.error("Error calculating PDA:", err);
      return null;
    }
  }, [hasWallet, userAddress]);

  // Fetch balances when modal opens
  useEffect(() => {
    if (!open || !hasWallet || !userAddress) {
      setWalletBalances([]);
      return;
    }

    let cancelled = false;
    const fetchBalances = async () => {
      setLoading(true);
      setError(null);
      const balances: WalletBalance[] = [];

      try {
        const userPubkey = new PublicKey(userAddress);

        // Check normal wallet USDC balance
        try {
          const userATA = await getAssociatedTokenAddress(
            USDC_MINT,
            userPubkey
          );

          const accountInfo = await connection.getAccountInfo(userATA);
          if (accountInfo) {
            const tokenAccountInfo =
              await connection.getParsedAccountInfo(userATA);
            if (
              tokenAccountInfo.value?.data &&
              "parsed" in tokenAccountInfo.value.data
            ) {
              const balance =
                tokenAccountInfo.value.data.parsed.info.tokenAmount.uiAmount;
              if (balance > 0) {
                balances.push({
                  address: userAddress,
                  balance,
                  type: "normal",
                  displayName: `${userAddress.slice(0, 4)}...${userAddress.slice(-4)}`,
                });
              }
            }
          }
        } catch (err) {
          console.log("No normal wallet USDC balance found");
        }

        // Check platform wallet USDC balance
        if (platformWalletPDA) {
          try {
            const platformATA = await getAssociatedTokenAddress(
              USDC_MINT,
              platformWalletPDA,
              true // allowOwnerOffCurve for PDA
            );

            const accountInfo = await connection.getAccountInfo(platformATA);
            if (accountInfo) {
              const tokenAccountInfo =
                await connection.getParsedAccountInfo(platformATA);
              if (
                tokenAccountInfo.value?.data &&
                "parsed" in tokenAccountInfo.value.data
              ) {
                const balance =
                  tokenAccountInfo.value.data.parsed.info.tokenAmount.uiAmount;
                if (balance > 0) {
                  balances.push({
                    address: platformWalletPDA.toString(),
                    balance,
                    type: "platform",
                    displayName: `Platform (${platformWalletPDA.toString().slice(0, 4)}...${platformWalletPDA.toString().slice(-4)})`,
                  });
                }
              }
            }
          } catch (err) {
            console.log("No platform wallet USDC balance found");
          }
        }

        if (!cancelled) {
          setWalletBalances(balances);
          if (balances.length === 1) {
            setSelectedWallet(balances[0]);
          }
        }
      } catch (err: any) {
        console.error("Error fetching balances:", err);
        if (!cancelled) {
          setError("Failed to fetch wallet balances");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchBalances();
    return () => {
      cancelled = true;
    };
  }, [open, hasWallet, userAddress, platformWalletPDA, connection]);

  // Calculate gas fee for platform withdrawals
  useEffect(() => {
    if (selectedWallet?.type === "platform" && withdrawAmount && prices.sol) {
      // Estimate gas fee (this is a simplified calculation)
      // In production, you'd want to simulate the transaction to get accurate fees
      const estimatedLamports = 10000; // Rough estimate for a typical transaction
      const solAmount = estimatedLamports / LAMPORTS_PER_SOL;
      const usdcAmount = (solAmount * prices.sol!) / (prices.usdc || 1);
      setGasFee(usdcAmount);
    } else {
      setGasFee(0);
    }
  }, [selectedWallet?.type, withdrawAmount, prices.sol, prices.usdc]);

  const maxWithdrawable = useMemo(() => {
    if (!selectedWallet) return 0;
    if (selectedWallet.type === "platform") {
      // For platform wallet, subtract estimated gas fee
      return Math.max(0, selectedWallet.balance - gasFee);
    }
    return selectedWallet.balance;
  }, [selectedWallet, gasFee]);

  const validation = useMemo(() => {
    const amount = parseFloat(withdrawAmount);
    const hasValidAmount =
      !isNaN(amount) && amount > 0 && amount <= maxWithdrawable;
    const hasValidDestination = destinationAddress.trim().length > 0;
    const hasSelectedWallet = selectedWallet !== null;

    try {
      if (hasValidDestination) {
        new PublicKey(destinationAddress.trim());
      }
    } catch {
      return {
        isValid: false,
        error: "Invalid destination address",
      };
    }

    if (!hasSelectedWallet) {
      return { isValid: false, error: "Select a wallet" };
    }

    if (!hasValidAmount) {
      return {
        isValid: false,
        error:
          amount > maxWithdrawable
            ? "Amount exceeds available balance"
            : "Enter valid amount",
      };
    }

    if (!hasValidDestination) {
      return { isValid: false, error: "Enter destination address" };
    }

    return { isValid: true, error: null };
  }, [withdrawAmount, destinationAddress, selectedWallet, maxWithdrawable]);

  const handleWithdraw = useCallback(async () => {
    if (!validation.isValid || !selectedWallet || !userAddress || !hasWallet)
      return;

    setSubmitting(true);
    setError(null);

    try {
      let withdrawalParams: any = {
        amount: parseFloat(withdrawAmount),
        destinationAddress: destinationAddress.trim(),
        walletType: selectedWallet.type,
        userAddress,
        connection,
      };

      if (selectedWallet.type === "platform") {
        // For platform withdrawals, use server-broadcast pattern
        withdrawalParams.userContext = userContext;

        // Temporarily close modal to allow Civic popup to be interactive
        setOpen(false);

        try {
          const solPrice = prices.sol || 100; // Fallback to $100 if price not available
          const signature = await withdraw(withdrawalParams, solPrice);

          console.log("Withdrawal successful:", signature);
          toast.success("Withdrawal successful!", {
            description: `Transaction: ${signature}`,
          });
          handleClose();
        } catch (err: any) {
          console.error("Withdrawal error:", err);
          setError(err.message || "Withdrawal failed");
          // Reopen modal to show error
          setOpen(true);
        }
      } else {
        // For normal wallet withdrawals, use Civic wallet for signing
        const civicWallet = {
          publicKey: new PublicKey(userAddress),
          // @ts-ignore
          signTransaction: userContext.solana?.signTransaction,
          // @ts-ignore
          signAllTransactions: userContext.solana?.signAllTransactions,
        };
        withdrawalParams.civicWallet = civicWallet;

        // Temporarily close modal to allow Civic popup to be interactive
        setOpen(false);

        try {
          const solPrice = prices.sol || 100; // Fallback to $100 if price not available
          const signature = await withdraw(withdrawalParams, solPrice);

          console.log("Withdrawal successful:", signature);
          toast.success("Withdrawal successful!", {
            description: `Transaction: ${signature}`,
          });
          handleClose();
        } catch (err: any) {
          console.error("Withdrawal error:", err);
          setError(err.message || "Withdrawal failed");
          // Reopen modal to show error
          setOpen(true);
        }
      }
    } catch (err: any) {
      console.error("Withdrawal error:", err);
      setError(err.message || "Withdrawal failed");
      // If we reach here, modal was never closed, so we don't need to reopen
    } finally {
      setSubmitting(false);
    }
  }, [
    validation.isValid,
    selectedWallet,
    withdrawAmount,
    destinationAddress,
    userAddress,
    connection,
    prices.sol,
    hasWallet,
    // @ts-ignore
    userContext.solana,
    wallet,
    setOpen,
  ]);

  const handleClose = () => {
    setOpen(false);
    setSelectedWallet(null);
    setWithdrawAmount("");
    setDestinationAddress("");
    setError(null);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogClose />
      <DialogContent className="max-w-md">
        <div className="py-4 px-2 space-y-6">
          <h1 className="text-center text-2xl font-bold font-sans">
            Withdraw USDC
          </h1>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Loading wallet balances...
              </p>
            </div>
          ) : walletBalances.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No USDC balances found</p>
            </div>
          ) : (
            <>
              {/* Wallet Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Wallet</label>
                {walletBalances.map((wallet) => (
                  <div
                    key={wallet.address}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedWallet?.address === wallet.address
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedWallet(wallet)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium">{wallet.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {wallet.type === "platform"
                              ? "Platform Wallet"
                              : "Personal Wallet"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          ${wallet.balance.toFixed(6)}
                        </p>
                        <p className="text-xs text-muted-foreground">USDC</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedWallet && (
                <>
                  {/* Amount Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (USDC)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.000001"
                        max={maxWithdrawable}
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.000000"
                        className="pr-16"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1 h-8 px-2 text-xs"
                        onClick={() =>
                          setWithdrawAmount(maxWithdrawable.toString())
                        }
                      >
                        MAX
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Available: ${maxWithdrawable.toFixed(6)} USDC
                      {selectedWallet.type === "platform" && gasFee > 0 && (
                        <span className="text-orange-600">
                          {" "}
                          (Gas fee: ~${gasFee.toFixed(6)} USDC)
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Destination Address */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Destination Address
                    </label>
                    <Input
                      type="text"
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                      placeholder="Enter Solana wallet address..."
                    />
                  </div>

                  {/* Withdrawal Info */}
                  {selectedWallet.type === "platform" ? (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Platform Wallet:</strong> Gas fees will be
                        sponsored and deducted from your USDC balance.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        <strong>Personal Wallet:</strong> You will pay
                        transaction fees in SOL from your wallet.
                      </p>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {error}
                  </p>
                </div>
              )}
            </>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={
                !validation.isValid || submitting || walletBalances.length === 0
              }
              className="w-full sm:w-auto flex items-center gap-2"
            >
              {submitting ? (
                "Processing..."
              ) : (
                <>
                  <ArrowDownCircle className="h-4 w-4" />
                  Withdraw
                </>
              )}
            </Button>
          </DialogFooter>

          {validation.error && (
            <p className="text-xs text-red-600 text-center">
              {validation.error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
