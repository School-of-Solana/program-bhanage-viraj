import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { MyAnchorProject } from "./target/types/my_anchor_project";

async function findRaffle() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MyAnchorProject as Program<MyAnchorProject>;

  console.log("Fetching all raffle accounts...\n");

  try {
    // Get all accounts owned by the program
    const accounts = await provider.connection.getProgramAccounts(
      program.programId
    );

    console.log(`Found ${accounts.length} program account(s) total\n`);
    
    for (const { pubkey, account } of accounts) {
      const publicKey = pubkey.toString();
      
      try {
        // Try to decode as raffle account
        const raffleAccount = await program.account.raffle.fetch(pubkey);
        
        // Check if this is the raffle we're looking for
        if (publicKey.startsWith("4p67ya3S")) {
          console.log("🎯 FOUND MATCHING RAFFLE:");
          console.log("=".repeat(80));
        }
        
        console.log(`Raffle Address: ${publicKey}`);
        console.log(`Creator/Owner:  ${raffleAccount.creator.toString()}`);
        console.log(`Ticket Price:   ${raffleAccount.ticketPrice.toString()} lamports (${raffleAccount.ticketPrice.toNumber() / 1e9} SOL)`);
        console.log(`Tickets Sold:   ${raffleAccount.ticketCount}`);
        console.log(`End Time:       ${new Date(raffleAccount.endTs.toNumber() * 1000).toLocaleString()}`);
        console.log(`Winner:         ${raffleAccount.winner !== null ? raffleAccount.winner : "Not drawn yet"}`);
        console.log(`Prize Claimed:  ${raffleAccount.prizeClaimed}`);
        console.log("-".repeat(80));
        console.log();
      } catch (err) {
        // Skip accounts that can't be decoded (old format or tickets)
        continue;
      }
    }
  } catch (error) {
    console.error("Error fetching raffles:", error);
  }
}

findRaffle();
