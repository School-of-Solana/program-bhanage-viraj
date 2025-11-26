import { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// Hardcoded values
export const PROGRAM_ID = new PublicKey("Gxi64mihQTXmwW4PXGpNV7inGKBxrx2i9nPpUKL2iNkH");
export const RPC_URL = "https://api.devnet.solana.com";

export const getConnection = () =>
  new Connection(RPC_URL, "confirmed");

// --- PDA HELPERS BASED ON YOUR IDL ---
export const findRafflePDA = (creator: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("raffle_v2"), creator.toBuffer()],
    PROGRAM_ID
  );

export const findVaultPDA = (rafflePda: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), rafflePda.toBuffer()],
    PROGRAM_ID
  );

export const findTicketPDA = (rafflePda: PublicKey, ticketNumber: number) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("ticket_v2"),
      rafflePda.toBuffer(),
      new BN(ticketNumber).toArrayLike(Buffer, "le", 4),
    ],
    PROGRAM_ID
  );