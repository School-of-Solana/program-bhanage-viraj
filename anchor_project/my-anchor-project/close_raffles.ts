import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const programId = new PublicKey("Gxi64mihQTXmwW4PXGpNV7inGKBxrx2i9nPpUKL2iNkH");

const wallets = [
  "3xeGx5dMMmMK2D9rYbFoyn5B9DyqvhrHHbSPVWEz4afZ",
  "2YQQBjWUA8Gj4pJ4euLXAzrRjGCiwpLMDCwm4tbTzsLN"
];

async function findRafflePDA(creator: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("raffle_v2"), creator.toBuffer()],
    programId
  );
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) throw new Error("IDL not found");
  
  const program = new Program(idl, provider);

  for (const wallet of wallets) {
    try {
      const creatorPubkey = new PublicKey(wallet);
      const [rafflePda] = await findRafflePDA(creatorPubkey);
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), rafflePda.toBuffer()],
        programId
      );
      
      console.log(`\nWallet: ${wallet}`);
      console.log(`Raffle PDA: ${rafflePda.toBase58()}`);
      
      // Check if account exists
      const accountInfo = await provider.connection.getAccountInfo(rafflePda);
      if (!accountInfo) {
        console.log("No raffle account found.");
        continue;
      }
      
      console.log(`Found raffle account, closing...`);
      
      try {
        await program.methods
          .closeRaffle()
          .accounts({
            creator: creatorPubkey,
            raffle: rafflePda,
            vault: vaultPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        console.log("✅ Raffle closed successfully!");
      } catch (err: any) {
        console.log("❌ Failed to close:", err.message);
      }
    } catch (err: any) {
      console.error(`Error processing ${wallet}:`, err.message);
    }
  }
}

main().catch(console.error);
