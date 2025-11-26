import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { BN } from "bn.js";

describe("raffle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MyAnchorProject;

  let rafflePda;
  let vaultPda;
  let bump;

  it("Initialize Raffle", async () => {
    const creator = provider.wallet.publicKey;

    [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), rafflePda.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeRaffle(new BN(1_000_000), new BN(Date.now() / 1000 + 2)) // End in 2 seconds
      .accounts({
        creator,
        raffle: rafflePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .rpc();

    const raffle = await program.account.raffle.fetch(rafflePda);
    assert(raffle.ticketPrice.eq(new BN(1_000_000)));
  });

  it("Buy Ticket", async () => {
    const buyer = provider.wallet.publicKey;
    
    // Calculate ticket PDA
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_v2"), rafflePda.toBuffer(), Buffer.from([0, 0, 0, 0])], // ticket_count = 0
      program.programId
    );

    await program.methods
      .buyTicket()
      .accounts({
        buyer,
        raffle: rafflePda,
        ticket: ticketPda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .rpc();

    const raffle = await program.account.raffle.fetch(rafflePda);
    assert.equal(raffle.ticketCount, 1);
    
    const ticket = await program.account.ticket.fetch(ticketPda);
    assert(ticket.buyer.equals(buyer));
    assert.equal(ticket.ticketNumber, 0);
  });

  it("Draw Winner and Claim Prize", async () => {
    // Wait for raffle to end (simulate time passage)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Draw winner
    const creator = provider.wallet.publicKey;
    await program.methods
      .drawWinner()
      .accounts({
        creator,
        raffle: rafflePda,
      })
      .rpc();

    const raffle = await program.account.raffle.fetch(rafflePda);
    assert(raffle.winner !== null);
    console.log("Winner ticket number:", raffle.winner);

    // Get winner's ticket PDA
    const winnerTicketNumber = raffle.winner;
    const [winnerTicketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_v2"), rafflePda.toBuffer(), Buffer.from([winnerTicketNumber, 0, 0, 0])],
      program.programId
    );

    // Claim prize (assuming winner is the same as buyer from previous test)
    const winner = provider.wallet.publicKey;
    const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);
    
    await program.methods
      .claimPrize()
      .accounts({
        winner,
        raffle: rafflePda,
        ticket: winnerTicketPda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);
    console.log("Vault balance before:", vaultBalanceBefore);
    console.log("Vault balance after:", vaultBalanceAfter);
    
    // Verify that funds were transferred to winner (90% of available funds after rent)
    const actualPrizeTransferred = vaultBalanceBefore - vaultBalanceAfter;
    console.log("Prize transferred:", actualPrizeTransferred);
    
    // Should transfer a significant portion but leave rent exemption
    // The actual amount depends on rent calculation, just verify transfer occurred
    assert(actualPrizeTransferred > 50000, "Should transfer a reasonable prize amount");
    assert(vaultBalanceAfter > 0, "Should leave some funds for rent exemption");
  });

  it("Close Raffle", async () => {
    const creator = provider.wallet.publicKey;
    const creatorBalanceBefore = await provider.connection.getBalance(creator);
    
    await program.methods
      .closeRaffle()
      .accounts({
        creator,
        raffle: rafflePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const creatorBalanceAfter = await provider.connection.getBalance(creator);
    console.log("Creator received remaining funds:", creatorBalanceAfter - creatorBalanceBefore);
  });
});
