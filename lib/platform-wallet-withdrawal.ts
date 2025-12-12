import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  getConnection,
  getServerWallet,
  signAndSendTransaction,
} from "./server-wallet";
import { AnchorError } from "@coral-xyz/anchor";
import { supportedTokens } from "@/config/wallet";

const USDC_MINT = new PublicKey(supportedTokens.contractAddress);
const USDC_DECIMALS = 6;

// Generate a withdrawal transaction for user to sign
export const generateWithdrawalTransaction = async (
  userPublicKey: PublicKey,
  destinationAddress: PublicKey,
  amount: number,
  gasInUsdc: number,
  program: any // Anchor program instance
): Promise<{
  serializedTransaction: string;
  message: string;
}> => {
  try {
    // Get server wallet first
    const serverWallet = getServerWallet();

    // Convert amounts to base units
    const amountInBaseUnits = new BN(
      Math.floor(amount * Math.pow(10, USDC_DECIMALS))
    );
    const gasInUsdcBaseUnits = new BN(
      Math.ceil(gasInUsdc * Math.pow(10, USDC_DECIMALS))
    );

    // Get the proper ATA for the destination address
    const connection = getConnection();
    const destinationAtaAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      serverWallet,
      USDC_MINT,
      destinationAddress,
      true
    );
    const destinationAta = destinationAtaAccount.address;

    // Create the withdraw transaction with explicit account resolution
    const withdrawBuilder = program.methods
      .withdraw({
        amount: amountInBaseUnits,
        gasInUsdc: gasInUsdcBaseUnits,
      })
      .accounts({
        signer: userPublicKey,
        receivingAta: destinationAta,
        tokenMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

    let tx;
    try {
      tx = await withdrawBuilder.transaction();
    } catch (error) {
      let n_error = error as AnchorError;
      console.error("Error details:", {
        message: n_error.message,
        logs: n_error.logs,
      });
      throw error;
    }

    // Set fee payer to server wallet (platform pays gas)
    tx.feePayer = serverWallet.publicKey;

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Server wallet signs first (as fee payer)
    tx.partialSign(serverWallet);

    // Serialize the transaction for user to sign (server signature already included)
    const serializedTransaction = tx
      .serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
      .toString("base64");

    return {
      serializedTransaction,
      message:
        "Withdrawal transaction created. User must sign and return for broadcasting.",
    };
  } catch (error) {
    console.error("Failed to generate withdrawal transaction:", error);
    throw error;
  }
};

// Broadcast user-signed withdrawal transaction
export const broadcastWithdrawalTransaction = async (
  userSignedTransaction: string
): Promise<string> => {
  try {
    // Deserialize the user-signed transaction (already has server signature)
    const transactionBuffer = Buffer.from(userSignedTransaction, "base64");
    const transaction = Transaction.from(transactionBuffer);

    // Verify transaction signatures before sending
    try {
      const isValid = transaction.verifySignatures();
    } catch (verifyError) {
      console.log("Signature verification error:", verifyError);
      throw verifyError;
    }

    // Transaction should already be fully signed, just broadcast it
    const signature = await signAndSendTransaction(transaction);

    console.log(`Withdrawal transaction broadcasted: ${signature}`);
    return signature;
  } catch (error) {
    console.error("Failed to broadcast withdrawal transaction:", error);
    throw error;
  }
};

// Create withdrawal transaction for user to sign
export const createWithdrawalTransaction = async (
  userId: string,
  userPublicKey: string,
  amount: number,
  destinationAddress: string,
  gasInUsdc: number,
  program: any
): Promise<{
  serializedTransaction: string;
  message: string;
}> => {
  try {
    // Convert string addresses to PublicKey objects
    const userPubKey = new PublicKey(userPublicKey);
    const destinationPubKey = new PublicKey(destinationAddress);

    // Generate the transaction for user to sign
    const result = await generateWithdrawalTransaction(
      userPubKey,
      destinationPubKey,
      amount,
      gasInUsdc,
      program
    );

    return result;
  } catch (error) {
    console.error("Failed to create withdrawal transaction:", error);
    throw error;
  }
};

// Complete withdrawal after user signs
export const completeWithdrawal = async (
  userId: string,
  userPublicKey: string,
  userSignedTransaction: string
): Promise<{
  signature: string;
}> => {
  try {
    // Broadcast the user-signed transaction
    const signature = await broadcastWithdrawalTransaction(
      userSignedTransaction
    );

    console.log(`Withdrawal completed for user ${userId}: ${signature}`);

    return {
      signature,
    };
  } catch (error) {
    console.error("Failed to complete withdrawal:", error);
    throw error;
  }
};
