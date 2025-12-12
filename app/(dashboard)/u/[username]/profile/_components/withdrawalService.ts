import {
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { getProgram } from "@/utils/program";
import { userHasWallet } from "@civic/auth-web3";
import idl from "@/switched_fun_program/target/idl/switched_fun.json";
import { supportedTokens } from "@/config/wallet";

// Constants
const USDC_MINT = new PublicKey(supportedTokens.contractAddress);
const PROGRAM_ID = new PublicKey("swinS25mqCw6ExEAtLJFxp6HYcqMvoYxKz3by6FfbRD");
const USDC_DECIMALS = 6;

export interface WithdrawalParams {
  amount: number; // USDC amount in UI units
  destinationAddress: string;
  walletType: "platform" | "normal";
  userAddress: string;
  connection: Connection;
  program?: any; // Anchor program instance (for platform withdrawals)
  civicWallet?: any; // Civic wallet for normal withdrawals
  userContext?: any; // Civic user context for platform withdrawals
}

/**
 * Estimates gas fee in SOL for a transaction
 */
export async function estimateGasFee(
  connection: Connection,
  transaction: Transaction
): Promise<number> {
  try {
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    const feeEstimate = await connection.getFeeForMessage(
      transaction.compileMessage()
    );

    return (feeEstimate.value || 0) / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error("Error estimating gas fee:", error);
    return 0.001; // Fallback estimate
  }
}

/**
 * Converts SOL amount to USDC amount
 */
export function convertSolToUsdc(
  solAmount: number,
  solPrice: number,
  usdcPrice: number = 1
): number {
  const usdValue = solAmount * solPrice;
  return usdValue / usdcPrice;
}

/**
 * Handles platform wallet withdrawal using server-broadcast pattern (like createStreamer)
 */
export async function withdrawFromPlatformWallet(
  params: WithdrawalParams,
  solPrice: number
): Promise<string> {
  const { amount, destinationAddress, userAddress, userContext } = params;

  try {
    // Estimate gas fee and convert to USDC
    const gasInSol = 0.001; // Conservative estimate for withdraw instruction
    const gasInUsdc = convertSolToUsdc(gasInSol, solPrice);

    // Step 1: Create withdrawal transaction on server
    const createResponse = await fetch("/api/wallet/platform/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        destinationAddress,
        userPublicKey: userAddress,
        gasInUsdc,
      }),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(
        errorData.message || "Failed to create withdrawal transaction"
      );
    }

    const { serializedTransaction } = await createResponse.json();

    // Step 2: User signs the transaction using Civic wallet
    if (!userContext?.solana?.wallet?.signTransaction) {
      throw new Error("Civic wallet not available for signing");
    }

    const { Transaction } = await import("@solana/web3.js");
    const transaction = Transaction.from(
      Buffer.from(serializedTransaction, "base64")
    );

    const signedTransaction =
      await userContext.solana.wallet.signTransaction(transaction);

    // console.log('Transaction after user signing:', {
    //   signatures: signedTransaction.signatures.map(sig => ({
    //     publicKey: sig.publicKey?.toString(),
    //     signature: sig.signature ? 'present' : 'missing'
    //   }))
    // });

    // Step 3: Send signed transaction back to server for broadcasting
    const completeResponse = await fetch("/api/wallet/platform/withdraw", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userSignedTransaction: Buffer.from(
          signedTransaction.serialize()
        ).toString("base64"),
        userPublicKey: userAddress,
      }),
    });

    if (!completeResponse.ok) {
      const errorData = await completeResponse.json();
      throw new Error(errorData.message || "Failed to complete withdrawal");
    }

    const result = await completeResponse.json();

    return result.signature;
  } catch (error) {
    console.error("Platform withdrawal error:", error);
    throw error;
  }
}

/**
 * Handles normal wallet withdrawal using direct SPL transfer
 */
export async function withdrawFromNormalWallet(
  params: WithdrawalParams
): Promise<string> {
  const { amount, destinationAddress, userAddress, connection, civicWallet } =
    params;

  if (!civicWallet || !civicWallet.signTransaction) {
    throw new Error(
      "Civic wallet with signing capability required for normal wallet withdrawal"
    );
  }

  try {
    const userPubkey = new PublicKey(userAddress);
    const destinationPubkey = new PublicKey(destinationAddress);

    // Get source and destination ATAs
    const sourceATA = await getAssociatedTokenAddress(USDC_MINT, userPubkey);
    const destinationATA = await getAssociatedTokenAddress(
      USDC_MINT,
      destinationPubkey
    );

    // Convert amount to base units
    const amountInBaseUnits = Math.floor(amount * Math.pow(10, USDC_DECIMALS));

    // Create transaction with transfer instruction
    const transaction = new Transaction();

    // Check if destination ATA exists, if not add create instruction
    try {
      await connection.getAccountInfo(destinationATA);
    } catch {
      // ATA doesn't exist, need to create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPubkey, // payer
          destinationATA,
          destinationPubkey, // owner
          USDC_MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceATA,
        destinationATA,
        userPubkey,
        amountInBaseUnits,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    // Sign transaction using Civic wallet
    const signedTransaction = await civicWallet.signTransaction(transaction);

    // Send and confirm transaction
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }
    );

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    return signature;
  } catch (error) {
    throw error;
  }
}

/**
 * Main withdrawal method that routes to appropriate handler
 */
export async function withdraw(
  params: WithdrawalParams,
  solPrice: number
): Promise<string> {
  if (params.walletType === "platform") {
    return withdrawFromPlatformWallet(params, solPrice);
  } else {
    return withdrawFromNormalWallet(params);
  }
}
