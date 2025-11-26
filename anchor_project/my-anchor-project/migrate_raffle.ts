import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { MyAnchorProject } from "./target/types/my_anchor_project";

/**
 * Migration script to fix old raffle accounts with invalid bool values
 * 
 * Usage:
 * 1. Add the raffle public key you want to migrate
 * 2. Run: ts-node migrate_raffle.ts
 */

async function migrateRaffle() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MyAnchorProject as Program<MyAnchorProject>;

  // ⚠️ REPLACE THIS with the actual raffle address you want to migrate
  const oldRaffleAddress = "YOUR_OLD_RAFFLE_ADDRESS_HERE";
  
  if (oldRaffleAddress === "YOUR_OLD_RAFFLE_ADDRESS_HERE") {
    console.error("❌ Please replace 'YOUR_OLD_RAFFLE_ADDRESS_HERE' with an actual raffle address");
    process.exit(1);
  }

  const oldRafflePubkey = new web3.PublicKey(oldRaffleAddress);

  console.log("🔄 Starting migration for raffle:", oldRaffleAddress);
  console.log("Authority:", provider.wallet.publicKey.toString());

  try {
    // Call the migrate_raffle instruction
    const tx = await program.methods
      .migrateRaffle()
      .accounts({
        authority: provider.wallet.publicKey,
        oldRaffle: oldRafflePubkey,
      })
      .rpc();

    console.log("✅ Migration successful!");
    console.log("Transaction signature:", tx);

    // Verify the migration
    const migratedAccount = await program.account.raffle.fetch(oldRafflePubkey);
    console.log("\n📊 Migrated raffle data:");
    console.log("Creator:", migratedAccount.creator.toString());
    console.log("Ticket Price:", migratedAccount.ticketPrice.toString());
    console.log("Ticket Count:", migratedAccount.ticketCount);
    console.log("End Time:", new Date(migratedAccount.endTs.toNumber() * 1000).toLocaleString());
    console.log("Winner:", migratedAccount.winner !== null ? migratedAccount.winner : "Not drawn yet");
    console.log("Prize Claimed:", migratedAccount.prizeClaimed); // Should now be false (valid boolean)
    
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    if (error.logs) {
      console.error("Program logs:", error.logs);
    }
  }
}

migrateRaffle();
