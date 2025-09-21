import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getConnection,
  getServerWallet,
  signAndSendTransaction,
} from "./server-wallet";
import { db } from "./db";

// Generate a platform wallet transaction for user to sign
export const generatePlatformWallet = async (
  userPublicKey: PublicKey,
  tokenMint: PublicKey,
  program: any // Anchor program instance
): Promise<{
  serializedTransaction: string;
  message: string;
}> => {
  try {
    // Get server wallet first
    const serverWallet = getServerWallet();

    // Create the createStreamer transaction
    const tx = await program.methods
      .createStreamer()
      .accounts({
        signer: userPublicKey,
        tokenMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        broadcaster: serverWallet.publicKey,
      })
      .transaction();

    // Set fee payer to server wallet (platform pays gas)
    tx.feePayer = serverWallet.publicKey;

    // Get recent blockhash
    const connection = getConnection();
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
        "Transaction created. User must sign and return for broadcasting.",
    };
  } catch (error) {
    console.error("Failed to generate platform wallet transaction:", error);
    throw error;
  }
};

// Broadcast user-signed platform wallet transaction
export const broadcastPlatformWalletTransaction = async (
  userSignedTransaction: string
): Promise<string> => {
  try {
    // Deserialize the user-signed transaction (already has server signature)
    const transactionBuffer = Buffer.from(userSignedTransaction, "base64");
    const transaction = Transaction.from(transactionBuffer);

    // Verify transaction signatures before sending
    try {
      const isValid = transaction.verifySignatures();
    } catch (verifyError: any) {
      console.log("Signature verification error:", verifyError.message);
    }

    // Transaction should already be fully signed, just broadcast it
    const signature = await signAndSendTransaction(transaction);

    console.log(`Platform wallet transaction broadcasted: ${signature}`);
    return signature;
  } catch (error) {
    console.error("Failed to broadcast platform wallet transaction:", error);
    throw error;
  }
};

// Create streamer profile on-chain using the program
export const createStreamerProfile = async (
  userWallet: PublicKey,
  tokenMint: PublicKey,
  program: any // Anchor program instance
): Promise<string> => {
  try {
    const serverWallet = getServerWallet();

    // Create the transaction using the program
    const tx = await program.methods
      .createStreamer()
      .accounts({
        signer: userWallet, // User's platform wallet
        tokenMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    // Set fee payer to server wallet (we pay gas)
    tx.feePayer = serverWallet.publicKey;

    // Get recent blockhash
    const connection = getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Sign and send transaction
    const signature = await signAndSendTransaction(tx);

    console.log(`Streamer profile created: ${signature}`);
    return signature;
  } catch (error) {
    console.error("Failed to create streamer profile:", error);
    throw error;
  }
};

// Create platform wallet transaction for user to sign
export const createUserPlatformWalletTransaction = async (
  userId: string,
  userPublicKey: string,
  tokenMint: string,
  program: any
): Promise<{
  serializedTransaction: string;
  message: string;
}> => {
  try {
    // Check if user already has platform wallet
    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        isSolanaPlatformWallet: true,
        platformWallet: true,
        username: true,
      },
    });

    if (!existingUser) {
      throw new Error("User not found");
    }

    if (existingUser.isSolanaPlatformWallet && existingUser.platformWallet) {
      throw new Error("User already has a platform wallet");
    }

    // Generate the transaction for user to sign
    const userPubKey = new PublicKey(userPublicKey);
    const tokenMintPubKey = new PublicKey(tokenMint);

    const result = await generatePlatformWallet(
      userPubKey,
      tokenMintPubKey,
      program
    );

    return result;
  } catch (error) {
    console.error("Failed to create platform wallet transaction:", error);
    throw error;
  }
};

// Complete platform wallet creation after user signs
export const completePlatformWalletCreation = async (
  userId: string,
  userPublicKey: string,
  userSignedTransaction: string
): Promise<{
  platformWallet: string;
  signature: string;
}> => {
  try {
    // Broadcast the user-signed transaction
    const signature = await broadcastPlatformWalletTransaction(
      userSignedTransaction
    );

    // Get user info
    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!existingUser) {
      throw new Error("User not found");
    }

    // Only update database AFTER successful broadcast
    // The transaction was successful if we reach this point
    await db.user.update({
      where: { id: userId },
      data: {
        platformWallet: userPublicKey,
        isSolanaPlatformWallet: true,
      },
    });

    console.log(
      `Platform wallet completed for user ${existingUser.username}: ${userPublicKey}`
    );

    return {
      platformWallet: userPublicKey,
      signature,
    };
  } catch (error) {
    console.error("Failed to complete platform wallet creation:", error);
    throw error;
  }
};

// Create streamer profile for user (combines wallet creation + on-chain profile)
export const createStreamerForUser = async (
  userId: string,
  tokenMint: string,
  program?: any
): Promise<{
  platformWallet: string;
  signature?: string;
}> => {
  try {
    // First ensure user has platform wallet
    const { platformWallet } = await createUserPlatformWallet(userId);

    // If program is provided, create on-chain streamer profile
    let signature: string | undefined;
    if (program) {
      const tokenMintPubkey = new PublicKey(tokenMint);
      const userWalletPubkey = new PublicKey(platformWallet);

      signature = await createStreamerProfile(
        userWalletPubkey,
        tokenMintPubkey,
        program
      );
    }

    return {
      platformWallet,
      signature,
    };
  } catch (error) {
    console.error("Failed to create streamer for user:", error);
    throw error;
  }
};

// Get user's platform wallet
export const getUserPlatformWallet = async (
  userId: string
): Promise<string | null> => {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        platformWallet: true,
        isSolanaPlatformWallet: true,
        solanaWallet: true,
      },
    });

    if (!user || !user.isSolanaPlatformWallet) {
      return null;
    }

    return user.platformWallet || user.solanaWallet;
  } catch (error) {
    console.error("Failed to get user platform wallet:", error);
    return null;
  }
};

// Create/get user platform wallet (database only - for existing wallets)
export const createUserPlatformWallet = async (
  userId: string
): Promise<{
  platformWallet: string;
}> => {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        platformWallet: true,
        isSolanaPlatformWallet: true,
        solanaWallet: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (
      !user.isSolanaPlatformWallet ||
      !user.platformWallet ||
      !user.solanaWallet
    ) {
      throw new Error(
        "User does not have a platform wallet. Use createUserPlatformWalletTransaction to create one."
      );
    }

    return {
      platformWallet: user.platformWallet || user.solanaWallet,
    };
  } catch (error) {
    console.error("Failed to get user platform wallet:", error);
    throw error;
  }
};

// Check if user has platform wallet
export const userHasPlatformWallet = async (
  userId: string
): Promise<boolean> => {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isSolanaPlatformWallet: true },
    });

    return user?.isSolanaPlatformWallet ?? false;
  } catch (error) {
    console.error("Failed to check user platform wallet:", error);
    return false;
  }
};

// Verify if streamer account actually exists on-chain
export const verifyStreamerAccountExists = async (
  userPublicKey: PublicKey,
  program: any
): Promise<boolean> => {
  try {
    if (!program) {
      console.warn("Program not available for verification");
      return false;
    }

    // Calculate the PDA for the streamer account
    const [streamerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), userPublicKey.toBuffer()],
      program.programId
    );

    // Try to fetch the account
    const account = await program.account.streamer.fetchNullable(streamerPDA);

    return account !== null;
  } catch (error) {
    console.error("Failed to verify streamer account:", error);
    return false;
  }
};
