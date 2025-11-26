import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { BN } from "bn.js";

describe("raffle - error scenarios", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MyAnchorProject;

  it("ERROR: Cannot initialize raffle twice with same seeds", async () => {
    const creator = provider.wallet.publicKey;
    
    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), rafflePda.toBuffer()],
      program.programId
    );

    try {
      // This should fail because raffle already exists from main test
      await program.methods
        .initializeRaffle(new BN(5_000_000), new BN(Math.floor(Date.now() / 1000) + 30))
        .accounts({
          creator,
          raffle: rafflePda,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .rpc();
      
      assert.fail("Should have failed to initialize raffle twice");
    } catch (error) {
      // Expected to fail - account already exists or seeds violated
      assert(error.message.includes("already in use") || error.message.includes("ConstraintSeeds") || error.message.includes("custom program error"), 
        "Should fail with account already exists error");
      console.log("✓ Correctly prevented double initialization");
    }
  });

  it("ERROR: Cannot buy ticket after raffle ends", async () => {
    const creator = provider.wallet.publicKey;

    // Get the raffle that should already exist (and might have ended)
    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), rafflePda.toBuffer()],
      program.programId
    );

    const raffle = await program.account.raffle.fetch(rafflePda);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // If raffle hasn't ended, skip this test
    if (currentTimestamp < raffle.endTs.toNumber()) {
      console.log("⚠ Skipping: Raffle hasn't ended yet");
      return;
    }

    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_v2"), rafflePda.toBuffer(), new BN(raffle.ticketCount).toArrayLike(Buffer, "le", 4)],
      program.programId
    );

    try {
      await program.methods
        .buyTicket()
        .accounts({
          buyer: creator,
          raffle: rafflePda,
          ticket: ticketPda,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .rpc();
      
      assert.fail("Should have failed to buy ticket for ended raffle");
    } catch (error) {
      assert(error.message.includes("RaffleEnded") || error.message.includes("6000"), 
        "Should fail with RaffleEnded error");
      console.log("✓ Correctly prevented buying ticket after raffle ended");
    }
  });

  it("ERROR: Cannot draw winner if raffle not ended", async () => {
    const creator = provider.wallet.publicKey;

    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const raffle = await program.account.raffle.fetch(rafflePda);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // If raffle has ended, skip this test
    if (currentTimestamp >= raffle.endTs.toNumber()) {
      console.log("⚠ Skipping: Raffle has already ended");
      return;
    }

    try {
      await program.methods
        .drawWinner()
        .accounts({
          creator,
          raffle: rafflePda,
        })
        .rpc();
      
      assert.fail("Should have failed to draw winner before raffle ends");
    } catch (error) {
      assert(error.message.includes("RaffleNotEnded") || error.message.includes("6001"), 
        "Should fail with RaffleNotEnded error");
      console.log("✓ Correctly prevented drawing winner before raffle ended");
    }
  });

  it("ERROR: Cannot draw winner if already drawn", async () => {
    const creator = provider.wallet.publicKey;

    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const raffle = await program.account.raffle.fetch(rafflePda);

    // If winner not yet drawn, skip this test
    if (raffle.winner === null) {
      console.log("⚠ Skipping: Winner hasn't been drawn yet");
      return;
    }

    try {
      await program.methods
        .drawWinner()
        .accounts({
          creator,
          raffle: rafflePda,
        })
        .rpc();
      
      assert.fail("Should have failed to draw winner twice");
    } catch (error) {
      assert(error.message.includes("WinnerAlreadyDrawn") || error.message.includes("6004"), 
        "Should fail with WinnerAlreadyDrawn error");
      console.log("✓ Correctly prevented drawing winner twice");
    }
  });

  it("ERROR: Cannot claim prize before winner is drawn", async () => {
    const creator = provider.wallet.publicKey;
    
    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), rafflePda.toBuffer()],
      program.programId
    );

    const raffle = await program.account.raffle.fetch(rafflePda);

    // If winner is drawn, skip this test
    if (raffle.winner !== null) {
      console.log("⚠ Skipping: Winner has already been drawn");
      return;
    }

    // Try to claim with any ticket
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_v2"), rafflePda.toBuffer(), Buffer.from([0, 0, 0, 0])],
      program.programId
    );

    try {
      await program.methods
        .claimPrize()
        .accounts({
          winner: creator,
          raffle: rafflePda,
          ticket: ticketPda,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("Should have failed to claim prize before winner drawn");
    } catch (error) {
      assert(error.message.includes("WinnerNotDrawn") || error.message.includes("6005") || error.message.includes("AccountNotInitialized"), 
        "Should fail with WinnerNotDrawn or account not found error");
      console.log("✓ Correctly prevented claiming before winner drawn");
    }
  });

  it("ERROR: Cannot claim prize if already claimed", async () => {
    const creator = provider.wallet.publicKey;
    
    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), rafflePda.toBuffer()],
      program.programId
    );

    const raffle = await program.account.raffle.fetch(rafflePda);

    // If prize not claimed yet, skip this test
    if (!raffle.prizeClaimed) {
      console.log("⚠ Skipping: Prize hasn't been claimed yet");
      return;
    }

    // Get winner ticket
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_v2"), rafflePda.toBuffer(), new BN(raffle.winner).toArrayLike(Buffer, "le", 4)],
      program.programId
    );

    try {
      await program.methods
        .claimPrize()
        .accounts({
          winner: creator,
          raffle: rafflePda,
          ticket: ticketPda,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("Should have failed to claim prize twice");
    } catch (error) {
      assert(error.message.includes("PrizeAlreadyClaimed") || error.message.includes("6008"), 
        "Should fail with PrizeAlreadyClaimed error");
      console.log("✓ Correctly prevented double claiming");
    }
  });

  it("ERROR: Cannot close raffle before it ends", async () => {
    const creator = provider.wallet.publicKey;

    const [rafflePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("raffle_v2"), creator.toBuffer()],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), rafflePda.toBuffer()],
      program.programId
    );

    const raffle = await program.account.raffle.fetch(rafflePda);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // If raffle has ended, skip this test
    if (currentTimestamp >= raffle.endTs.toNumber()) {
      console.log("⚠ Skipping: Raffle has already ended");
      return;
    }

    try {
      await program.methods
        .closeRaffle()
        .accounts({
          creator,
          raffle: rafflePda,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("Should have failed to close raffle before it ends");
    } catch (error) {
      assert(error.message.includes("RaffleNotEnded") || error.message.includes("6001"), 
        "Should fail with RaffleNotEnded error");
      console.log("✓ Correctly prevented closing before raffle ended");
    }
  });
});
