"use client";
import { Buffer } from "buffer";

import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useEffect, useMemo, useState } from "react";
import {
  PROGRAM_ID,
  RPC_URL,
  getConnection,
  findRafflePDA,
  findVaultPDA,
  findTicketPDA,
} from "../src/anchor/anchorClient";
import { SystemProgram, Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { IDL } from "../src/anchor/idl";
import { 
  PixelTicketIcon, 
  PixelCoinIcon, 
  PixelClockIcon, 
  PixelTrophyIcon, 
  PixelHeartIcon,
  PixelHomeIcon,
  PixelStarIcon,
  PixelGearIcon,
  PixelPrizeIcon
} from "../src/components/PixelIcons";

export default function Home() {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [status, setStatus] = useState("");
  const [raffles, setRaffles] = useState<any[]>([]);
  const [programError, setProgramError] = useState<string>("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Renamed Gamification States (Level -> Rank, XP -> Points, etc.)
  const [points, setPoints] = useState(0);
  const [rank, setRank] = useState(1);
  const [badges, setBadges] = useState<string[]>([]);
  const [showBadge, setShowBadge] = useState<string | null>(null);
  const [showPixelOrbs, setShowPixelOrbs] = useState(false);
  const [showWheelReveal, setShowWheelReveal] = useState(false);
  const [wheelNames, setWheelNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [showLoots, setShowLoots] = useState(false);
  const [activeNav, setActiveNav] = useState("raffles");
  const [showSparkles, setShowSparkles] = useState(false);
  const [showCoinPop, setShowCoinPop] = useState(false);
  const [showMachine, setShowMachine] = useState(false);
  const [showTicketDrop, setShowTicketDrop] = useState(false);
  const [formError, setFormError] = useState(false);
  
  // Slot Machine States
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [slotReels, setSlotReels] = useState<string[]>(["?", "?", "?", "?", "?"]);
  const [reelStates, setReelStates] = useState<string[]>(["spinning", "spinning", "spinning", "spinning", "spinning"]);
  const [winnerAddress, setWinnerAddress] = useState<string>("");
  const [showWinnerReveal, setShowWinnerReveal] = useState(false);
  const [leverPulled, setLeverPulled] = useState(false);

  // Build a connection from your RPC env
  const connection: Connection | null = useMemo(() => {
    try {
      return getConnection();
    } catch {
      return null;
    }
  }, []);

  // Build Anchor provider and program once wallet + connection are ready
  const provider = useMemo(() => {
    if (!anchorWallet || !connection) return null;
    return new anchor.AnchorProvider(connection, anchorWallet, {
      preflightCommitment: "confirmed",
    });
  }, [anchorWallet, connection]);

  const program = useMemo(() => {
    if (!provider) return null;

    try {
      // @ts-ignore
      return new anchor.Program(IDL as any, provider);
    } catch (error: any) {
      console.error("Failed to create program:", error);
      setProgramError(error.message || JSON.stringify(error));
      return null;
    }
  }, [provider]);

  // Fetch all raffles
  const fetchAllRaffles = async () => {
    if (!program || !connection) return;
    try {
      setStatus("Fetching raffles...");
      
      // Fetch all program accounts manually to handle deserialization errors per account
      const programAccounts = await connection.getProgramAccounts(program.programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              // Raffle discriminator from IDL: [143, 133, 63, 173, 138, 10, 142, 200]
              bytes: anchor.utils.bytes.bs58.encode(
                Buffer.from([143, 133, 63, 173, 138, 10, 142, 200])
              ),
            },
          },
        ],
      });

      console.log(`Found ${programAccounts.length} raffle account(s) on-chain`);

      const parsedRaffles = (await Promise.all(programAccounts.map(async ({ pubkey, account }) => {
        try {
          // Manually parse the account data to handle invalid boolean values
          const data = account.data;
          
          // Check if the account has enough data for the raffle structure
          if (data.length < 8 + 32 + 8 + 4 + 8 + 5 + 1 + 1) {
            console.warn("Skipping account with insufficient data:", pubkey.toString());
            return null;
          }

          // Check the prize_claimed boolean at offset 8 + 32 + 8 + 4 + 8 + 5 = 65
          const prizeClaimedByte = data[65];
          if (prizeClaimedByte !== 0 && prizeClaimedByte !== 1) {
            console.warn(`Skipping raffle ${pubkey.toString()} with invalid bool value: ${prizeClaimedByte}`);
            return null;
          }

          // Try to deserialize the raffle account
          const raffleAccount = (program.account as any).raffle.coder.accounts.decode(
            "raffle",
            data
          );

          const raffle = {
            publicKey: pubkey,
            account: raffleAccount,
            winnerAddress: null as string | null,
          };

          // If a winner is drawn, fetch the ticket to get the winner's address
          if (raffleAccount.winner !== null && raffleAccount.winner !== undefined) {
            try {
              const [ticketPda] = findTicketPDA(pubkey, raffleAccount.winner);
              const ticketAccount = await (program.account as any).ticket.fetch(ticketPda);
              raffle.winnerAddress = ticketAccount.buyer.toString();
            } catch (e) {
              console.error("Failed to fetch winning ticket:", e);
            }
          }
          return raffle;
        } catch (e: any) {
          // Skip raffles that can't be deserialized (old account structure with invalid bool values)
          console.warn("Skipping incompatible raffle:", pubkey.toString(), e.message);
          return null;
        }
      }))).filter((raffle) => raffle !== null);

      // Filter out specific old raffle IDs
      const blockedRaffleIds = ['7DchNzfkzz4aoYj2TN8ZWScYRzz9HS9uXjPPTvTAdCYg', 'F6HPWnvRSMHQ1EdPm1UU2sCBprRjeQaNz7xnkBWbNa8n'];
      const filteredRaffles = parsedRaffles.filter((raffle) => 
        !blockedRaffleIds.includes(raffle.publicKey.toString())
      );

      setRaffles(filteredRaffles);
      setStatus(`${filteredRaffles.length} raffle(s) loaded`);
    } catch (err: any) {
      console.error("Error fetching raffles:", err);
      setStatus(`Error fetching raffles: ${err.message}`);
    }
  };

  // Renamed Gamification Functions (XP -> Points, Level -> Rank, etc.)
  const addPoints = (amount: number) => {
    setPoints((prev) => {
      const newPoints = prev + amount;
      const pointsForNextRank = rank * 100;
      if (newPoints >= pointsForNextRank) {
        setRank((r) => r + 1);
        unlockBadge(`Reached Rank ${rank + 1}!`);
        return newPoints - pointsForNextRank;
      }
      return newPoints;
    });
    setShowPixelOrbs(true);
    setTimeout(() => setShowPixelOrbs(false), 1000);
  };

  const unlockBadge = (title: string) => {
    if (!badges.includes(title)) {
      setBadges([...badges, title]);
      setShowBadge(title);
      setTimeout(() => setShowBadge(null), 4000);
    }
  };

  const fetchUserTickets = async () => {
    if (!program || !publicKey) return;
    try {
      const allTickets = await (program.account as any).ticket.all();
      const myTickets = allTickets.filter((t: any) => 
        t.account.buyer.toString() === publicKey.toString()
      );
      setUserTickets(myTickets);
    } catch (err) {
      console.error("Failed to fetch user tickets:", err);
    }
  };

  useEffect(() => {
    if (program) {
      fetchAllRaffles();
      fetchUserTickets();
    }
  }, [program]);

  // Real-time countdown timer - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load badges from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pixel-badges');
    const savedPoints = localStorage.getItem('pixel-points');
    const savedRank = localStorage.getItem('pixel-rank');
    if (saved) setBadges(JSON.parse(saved));
    if (savedPoints) setPoints(parseInt(savedPoints));
    if (savedRank) setRank(parseInt(savedRank));
  }, []);

  // Save badges to localStorage
  useEffect(() => {
    localStorage.setItem('pixel-badges', JSON.stringify(badges));
    localStorage.setItem('pixel-points', points.toString());
    localStorage.setItem('pixel-rank', rank.toString());
  }, [badges, points, rank]);

  async function initializeRaffle() {
    if (!anchorWallet || !program) {
      setStatus("Wallet or program not ready");
      return;
    }
    try {
      const creator = anchorWallet.publicKey;
      const [rafflePda] = findRafflePDA(creator);
      const [vaultPda] = findVaultPDA(rafflePda);

      // Check if raffle account exists and force close it first
      try {
        const accountInfo = await connection?.getAccountInfo(rafflePda);
        if (accountInfo) {
          setStatus("Found existing raffle, force closing...");
          
          // Try to close using the program method first
          try {
            await program.methods
              .closeRaffle()
              .accounts({
                creator,
                raffle: rafflePda,
                vault: vaultPda,
                systemProgram: SystemProgram.programId,
              })
              .rpc();
            setStatus("Old raffle closed successfully.");
          } catch (closeErr: any) {
            // If program close fails, we'll still try to create - Solana will handle the conflict
            console.warn("Could not close via program:", closeErr.message);
            setStatus("Attempting to create new raffle anyway...");
          }
          
          // Wait a bit for the close to settle
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (checkErr) {
        console.log("No existing raffle found or check failed:", checkErr);
      }

      setStatus("Initializing raffle...");

      const endTimeSeconds = Math.floor(Date.now() / 1000) + (durationMinutes * 60);
      await program.methods
        .initializeRaffle(
          new anchor.BN(10_000_000), // ticket_price (0.01 SOL)
          new anchor.BN(endTimeSeconds) // end_ts (custom duration from user input)
        )
        .accounts({
          creator,
          raffle: rafflePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus("✅ Raffle created successfully!");
      setShowSparkles(true);
      setTimeout(() => setShowSparkles(false), 1500);
      addPoints(50);
      if (badges.length === 0 || !badges.includes("First Raffle Created!")) {
        unlockBadge("First Raffle Created!");
      }
      await fetchAllRaffles();
    } catch (err: any) {
      console.error("Initialize error:", err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("already in use") || msg.includes("0x0")) {
        setStatus("❌ You have an existing raffle. Please wait for it to end and close it first, or use a different wallet.");
      } else {
        setStatus(`❌ Failed to create raffle: ${msg.slice(0, 100)}`);
      }
    }
  }

  async function closeMyRaffle() {
    if (!anchorWallet || !program) {
      setStatus("Wallet or program not ready");
      return;
    }
    try {
      const creator = anchorWallet.publicKey;
      const [rafflePda] = findRafflePDA(creator);
      
      // Check if it's one of the blocked old raffles
      const blockedRaffleIds = ['7DchNzfkzz4aoYj2TN8ZWScYRzz9HS9uXjPPTvTAdCYg', 'F6HPWnvRSMHQ1EdPm1UU2sCBprRjeQaNz7xnkBWbNa8n'];
      if (blockedRaffleIds.includes(rafflePda.toString())) {
        setStatus("❌ Old format raffle cannot be closed. Please use a different wallet to create new raffles.");
        return;
      }
      
      const [vaultPda] = findVaultPDA(rafflePda);
      
      setStatus("Closing your raffle...");

      await program.methods
        .closeRaffle()
        .accounts({
          creator,
          raffle: rafflePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus("✅ Raffle closed successfully!");
      await fetchAllRaffles();
    } catch (err: any) {
      console.error("Close raffle error:", err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("3012") || msg.includes("AccountNotInitialized")) {
        setStatus("❌ You don't have any raffle to close.");
      } else if (msg.includes("3003") || msg.includes("AccountDidNotDeserialize")) {
        setStatus("❌ Old format raffle detected. Create a new raffle to overwrite it.");
      } else if (msg.includes("6001") || msg.includes("RaffleNotEnded")) {
        setStatus("❌ Cannot close raffle until it has ended.");
      } else {
        setStatus(`❌ Failed to close raffle: ${msg.slice(0, 80)}`);
      }
    }
  }

  async function buyTicket(raffle: any) {
    if (!anchorWallet || !program) {
      setStatus("Wallet or program not ready");
      return;
    }
    
    // Block interaction with old incompatible raffles
    const blockedRaffleIds = ['7DchNzfkzz4aoYj2TN8ZWScYRzz9HS9uXjPPTvTAdCYg', 'F6HPWnvRSMHQ1EdPm1UU2sCBprRjeQaNz7xnkBWbNa8n'];
    if (blockedRaffleIds.includes(raffle.publicKey.toString())) {
      setStatus("❌ This is an old incompatible raffle. Please refresh the page.");
      await fetchAllRaffles();
      return;
    }
    
    try {
      const rafflePubkey = raffle.publicKey;
      const [vaultPda] = findVaultPDA(rafflePubkey);
      const buyer = anchorWallet.publicKey;

      // ALWAYS fetch fresh on-chain data to avoid stale ticket count
      const freshRaffleAccount = await (program.account as any).raffle.fetch(rafflePubkey);
      const ticketNumber = freshRaffleAccount.ticketCount;
      const [ticket] = findTicketPDA(rafflePubkey, ticketNumber);

      // Check if this ticket already exists
      const existingTicket = await connection?.getAccountInfo(ticket);
      if (existingTicket) {
        setStatus("❌ This ticket already exists. Refreshing raffle data...");
        await new Promise(resolve => setTimeout(resolve, 1500));
        await fetchAllRaffles();
        return;
      }

      setStatus(`Buying ticket #${ticketNumber} for raffle ${rafflePubkey.toString().slice(0, 4)}...`);

      const txSignature = await program.methods
        .buyTicket()
        .accounts({
          buyer,
          raffle: rafflePubkey,
          ticket,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Wait for confirmation
      await connection?.confirmTransaction(txSignature, "confirmed");

      setStatus("🎟️ Ticket purchased successfully!");
      setShowCoinPop(true);
      setShowMachine(true);
      setTimeout(() => {
        setShowCoinPop(false);
        setShowMachine(false);
        setShowTicketDrop(true);
        setTimeout(() => setShowTicketDrop(false), 1000);
      }, 800);
      addPoints(20);
      
      // Wait a bit for blockchain to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await fetchAllRaffles();
      await fetchUserTickets();
      
      const ticketCount = userTickets.length + 1;
      if (ticketCount === 1) unlockBadge("First Ticket Bought!");
      if (ticketCount === 10) unlockBadge("Collected 10 Tickets!");
    } catch (err: any) {
      console.error("Buy ticket error:", err);
      console.error("Full error details:", JSON.stringify(err, null, 2));
      const msg = err.message || JSON.stringify(err);
      
      if (msg.includes("3003") || msg.includes("AccountDidNotDeserialize")) {
        setStatus("❌ This raffle uses an old format. Please create a new raffle.");
      } else if (msg.includes("6003") || msg.includes("RaffleEnded")) {
        setStatus("❌ Raffle has already ended. Cannot buy tickets.");
      } else if (msg.includes("already in use") || msg.includes("0x0")) {
        setStatus("❌ Ticket already purchased. Refreshing data...");
        // The ticket was likely already bought, just refresh
        await new Promise(resolve => setTimeout(resolve, 2000));
        await fetchAllRaffles();
      } else if (msg.includes("insufficient")) {
        setStatus("❌ Insufficient SOL. You need at least 0.01 SOL + fees.");
      } else if (msg.includes("User rejected")) {
        setStatus("❌ Transaction cancelled.");
      } else {
        setStatus(`❌ Error: ${msg.slice(0, 100)}`);
      }
    }
  }

  async function drawWinner(raffle: any) {
    if (!anchorWallet || !program) {
      setStatus("Wallet or program not ready");
      return;
    }
    try {
      setStatus("Spinning the Slot Machine...");
      
      // Show slot machine animation
      setShowSlotMachine(true);
      setLeverPulled(true);
      setSlotReels(["?", "?", "?", "?", "?"]);
      setReelStates(["spinning", "spinning", "spinning", "spinning", "spinning"]);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      setLeverPulled(false);

      // Draw the winner on blockchain
      await program.methods
        .drawWinner()
        .accounts({
          creator: anchorWallet.publicKey,
          raffle: raffle.publicKey,
        })
        .rpc();

      // Fetch the winner's address
      const freshRaffleAccount = await (program.account as any).raffle.fetch(raffle.publicKey);
      if (freshRaffleAccount.winner !== null && freshRaffleAccount.winner !== undefined) {
        try {
          const [ticketPda] = findTicketPDA(raffle.publicKey, freshRaffleAccount.winner);
          const ticketAccount = await (program.account as any).ticket.fetch(ticketPda);
          const winner = ticketAccount.buyer.toString();
          setWinnerAddress(winner);
          
          // Animate reels stopping one by one
          const chars = winner.split('');
          
          // Stop reel 1
          await new Promise(resolve => setTimeout(resolve, 1500));
          setSlotReels(prev => [chars[0], prev[1], prev[2], prev[3], prev[4]]);
          setReelStates(prev => ["stopped", prev[1], prev[2], prev[3], prev[4]]);
          
          // Stop reel 2
          await new Promise(resolve => setTimeout(resolve, 500));
          setSlotReels(prev => [prev[0], chars[1], prev[2], prev[3], prev[4]]);
          setReelStates(prev => [prev[0], "stopped", prev[2], prev[3], prev[4]]);
          
          // Stop reel 3
          await new Promise(resolve => setTimeout(resolve, 500));
          setSlotReels(prev => [prev[0], prev[1], chars[2], prev[3], prev[4]]);
          setReelStates(prev => [prev[0], prev[1], "stopped", prev[3], prev[4]]);
          
          // Stop reel 4
          await new Promise(resolve => setTimeout(resolve, 500));
          setSlotReels(prev => [prev[0], prev[1], prev[2], chars[3], prev[4]]);
          setReelStates(prev => [prev[0], prev[1], prev[2], "stopped", prev[4]]);
          
          // Stop reel 5 and trigger flash
          await new Promise(resolve => setTimeout(resolve, 500));
          setSlotReels([chars[0], chars[1], chars[2], chars[3], chars[4]]);
          setReelStates(["stopped", "stopped", "stopped", "stopped", "stopped"]);
          
          // Flash and reveal winner
          await new Promise(resolve => setTimeout(resolve, 500));
          setShowWinnerReveal(true);
          setShowSparkles(true);
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
          console.error("Failed to fetch winning ticket:", e);
        }
      }

      setStatus("🎉 Winner drawn successfully!");
      setShowSlotMachine(false);
      setShowWinnerReveal(false);
      setShowSparkles(false);
      addPoints(30);
      await fetchAllRaffles();
    } catch (err: any) {
      console.error("Draw winner error:", err);
      setShowSlotMachine(false);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("3003") || msg.includes("AccountDidNotDeserialize")) {
        setStatus("❌ This raffle uses an old format. Please create a new raffle.");
      } else if (msg.includes("6002") || msg.includes("RaffleNotEnded")) {
        setStatus("❌ Raffle has not ended yet. Wait for the timer to complete.");
      } else if (msg.includes("6004") || msg.includes("NoTicketsSold")) {
        setStatus("❌ No tickets sold. Cannot draw a winner.");
      } else if (msg.includes("6000") || msg.includes("Unauthorized")) {
        setStatus("❌ Only the raffle creator can draw the winner.");
      } else {
        setStatus(`❌ Failed to draw winner: ${msg}`);
      }
    }
  }

  async function claimPrize(raffle: any) {
    if (!anchorWallet || !program) {
      setStatus("Wallet or program not ready");
      return;
    }
    try {
      const rafflePubkey = raffle.publicKey;
      const [vaultPda] = findVaultPDA(rafflePubkey);

      const currentRaffleAccount = await (program.account as any).raffle.fetch(rafflePubkey);

      if (currentRaffleAccount.winner === null || currentRaffleAccount.winner === undefined) {
        setStatus("No winner drawn yet.");
        return;
      }

      const ticketNumber = currentRaffleAccount.winner;
      const [ticket] = findTicketPDA(rafflePubkey, ticketNumber);

      setStatus("Claiming prize...");

      await program.methods
        .claimPrize()
        .accounts({
          winner: anchorWallet.publicKey,
          raffle: rafflePubkey,
          ticket,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus("🏆 Prize claimed successfully!");
      setShowCelebration(true);
      addPoints(100);
      unlockBadge("Lucky Winner: Won a Raffle!");
      setTimeout(() => setShowCelebration(false), 5000);
      await fetchAllRaffles();
    } catch (err: any) {
      console.error("Claim prize error:", err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("3003") || msg.includes("AccountDidNotDeserialize")) {
        setStatus("❌ This raffle uses an old format. Cannot claim prize.");
      } else if (msg.includes("6007") || msg.includes("NotTicketOwner")) {
        setStatus("❌ You are not the winner of this raffle.");
      } else if (msg.includes("6008") || msg.includes("PrizeAlreadyClaimed")) {
        setStatus("❌ Prize has already been claimed.");
      } else {
        setStatus(`❌ Failed to claim prize: ${msg}`);
      }
    }
  }

  return (
    <div className="min-h-screen text-white p-4 sm:p-8 relative">
      {/* Pixel Background Landscape */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Pixel Mountains */}
        <div className="pixel-mountains">
          <svg className="absolute bottom-0 left-0 w-full h-full opacity-40" viewBox="0 0 1200 200" preserveAspectRatio="none">
            <polygon points="0,200 0,100 100,80 200,120 300,60 400,100 500,40 600,80 700,100 800,60 900,90 1000,70 1100,100 1200,80 1200,200" fill="#2d1810" />
            <polygon points="0,200 0,140 150,120 300,160 450,100 600,140 750,110 900,130 1050,110 1200,140 1200,200" fill="#4a2f1a" />
          </svg>
        </div>
        
        {/* Pixel Clouds */}
        <div className="pixel-cloud" style={{top: '10%', animationDuration: '100s'}}>
          <svg width="120" height="40" viewBox="0 0 120 40">
            <rect x="20" y="20" width="80" height="12" fill="white" opacity="0.6" />
            <rect x="10" y="24" width="20" height="8" fill="white" opacity="0.6" />
            <rect x="90" y="24" width="20" height="8" fill="white" opacity="0.6" />
          </svg>
        </div>
        <div className="pixel-cloud" style={{top: '20%', animationDuration: '140s', animationDelay: '-30s'}}>
          <svg width="100" height="35" viewBox="0 0 100 35">
            <rect x="15" y="15" width="70" height="10" fill="white" opacity="0.5" />
            <rect x="8" y="18" width="15" height="7" fill="white" opacity="0.5" />
            <rect x="77" y="18" width="15" height="7" fill="white" opacity="0.5" />
          </svg>
        </div>
        
        {/* Pixel Birds */}
        <div className="pixel-bird" style={{top: '15%', left: '20%', animationDuration: '10s'}}>
          <svg width="16" height="12" viewBox="0 0 16 12">
            <rect x="4" y="4" width="8" height="4" fill="#333" />
            <rect x="0" y="6" width="4" height="2" fill="#333" />
            <rect x="12" y="6" width="4" height="2" fill="#333" />
          </svg>
        </div>
        <div className="pixel-bird" style={{top: '25%', left: '70%', animationDuration: '12s', animationDelay: '-5s'}}>
          <svg width="16" height="12" viewBox="0 0 16 12">
            <rect x="4" y="4" width="8" height="4" fill="#333" />
            <rect x="0" y="6" width="4" height="2" fill="#333" />
            <rect x="12" y="6" width="4" height="2" fill="#333" />
          </svg>
        </div>
        
        {/* Pixel Dust Particles */}
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute pixel-dust"
            style={{
              left: `${Math.random() * 100}%`,
              bottom: '0',
              animationDuration: `${20 + Math.random() * 30}s`,
              animationDelay: `${Math.random() * -30}s`,
            }}
          >
            <svg width="4" height="4" viewBox="0 0 4 4">
              <rect width="4" height="4" fill="rgba(255, 255, 255, 0.3)" />
            </svg>
          </div>
        ))}
      </div>

      {/* Pixel Sparkles Animation */}
      {showSparkles && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute pixel-sparkle"
              style={{
                left: `${50 + (Math.random() - 0.5) * 60}%`,
                top: `${30 + (Math.random() - 0.5) * 40}%`,
                animationDelay: `${i * 0.05}s`
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20">
                <rect x="8" y="0" width="4" height="4" fill="#fbbf24" />
                <rect x="8" y="16" width="4" height="4" fill="#fbbf24" />
                <rect x="0" y="8" width="4" height="4" fill="#fbbf24" />
                <rect x="16" y="8" width="4" height="4" fill="#fbbf24" />
                <rect x="8" y="8" width="4" height="4" fill="#fde047" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {/* Coin Pop Animation */}
      {showCoinPop && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute coin-pop"
              style={{
                animationDelay: `${i * 0.1}s`,
                left: `${50 + (Math.random() - 0.5) * 30}%`,
              }}
            >
              <PixelCoinIcon className="text-yellow-400 w-12 h-12" />
            </div>
          ))}
        </div>
      )}

      {/* Pixel Machine Animation */}
      {showMachine && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div className="machine-shake">
            <div className="pixel-card bg-gray-700 p-8">
              <div className="text-6xl mb-4">🎰</div>
              <div className="text-white text-sm font-bold">RAFFLE MACHINE</div>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Drop Animation */}
      {showTicketDrop && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="ticket-drop">
            <PixelTicketIcon className="text-yellow-400 w-24 h-24" />
          </div>
        </div>
      )}

      {/* Points Orbs Animation */}
      {showPixelOrbs && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-xp-orb"
              style={{
                left: `${50 + (Math.random() - 0.5) * 40}%`,
                bottom: '20%',
                animationDelay: `${i * 0.1}s`
              }}
            >
              <PixelStarIcon className="text-blue-400 w-8 h-8" />
            </div>
          ))}
        </div>
      )}

      {/* Badge Popup */}
      {showBadge && (
        <div className="fixed top-4 right-4 z-50 achievement-popup pixel-card bg-gradient-to-r from-purple-600 to-blue-600 p-4 border-4 border-purple-800">
          <div className="flex items-center gap-3">
            <PixelTrophyIcon className="text-yellow-300 w-8 h-8" />
            <div>
              <div className="text-yellow-200 font-bold text-xs sm:text-sm mb-1">🎖️ Badge Unlocked!</div>
              <div className="text-white text-sm sm:text-base">{showBadge}</div>
            </div>
          </div>
        </div>
      )}

      {/* 8-bit Wheel Spin Winner Reveal */}
      {showWheelReveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
          <div className="text-center">
            <div className="text-cyan-300 text-2xl sm:text-4xl font-bold mb-8 animate-pulse">🎡 SPINNING THE WHEEL 🎡</div>
            <div className="relative w-64 h-64 mx-auto mb-8">
              <div className="pixel-wheel absolute inset-0">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  <circle cx="100" cy="100" r="90" fill="#1e293b" stroke="#fbbf24" strokeWidth="8" />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                    <g key={i} transform={`rotate(${angle} 100 100)`}>
                      <rect x="95" y="20" width="10" height="70" fill={i % 2 === 0 ? '#ef4444' : '#3b82f6'} />
                    </g>
                  ))}
                  <circle cx="100" cy="100" r="20" fill="#fbbf24" />
                </svg>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
              {wheelNames.map((name, i) => (
                <div
                  key={i}
                  className="card-fly pixel-card bg-slate-700 px-3 py-2 text-white text-sm"
                  style={{animationDelay: `${i * 0.15}s`}}
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pixel Slot Machine Winner Reveal */}
      {showSlotMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-95">
          <div className="text-center">
            <div className="text-yellow-300 text-2xl sm:text-4xl font-bold mb-8 animate-pulse">
              🎰 DRAWING WINNER 🎰
            </div>
            
            {/* Slot Machine */}
            <div className={`pixel-card bg-gradient-to-b from-red-700 via-red-600 to-red-800 p-8 rounded-lg border-4 border-yellow-600 ${showWinnerReveal ? 'slot-flash' : ''} slot-glow`}>
              {/* Machine Top */}
              <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-3 rounded-t-lg mb-4 border-4 border-yellow-700">
                <div className="text-red-900 text-xl font-bold tracking-wider">PIXEL RAFFLE</div>
              </div>
              
              {/* Reels Container */}
              <div className="bg-slate-900 p-6 rounded-lg border-4 border-slate-950 mb-4">
                <div className="flex gap-3 justify-center mb-4">
                  {slotReels.map((char, i) => (
                    <div
                      key={i}
                      className="relative"
                    >
                      {/* Reel Window */}
                      <div className="pixel-card bg-white w-16 h-20 sm:w-20 sm:h-24 rounded-md border-4 border-slate-700 overflow-hidden relative">
                        <div className={`absolute inset-0 flex items-center justify-center ${
                          reelStates[i] === "spinning" ? "reel-spin-fast" : reelStates[i] === "stopped" ? "reel-stop" : ""
                        }`}>
                          {reelStates[i] === "spinning" ? (
                            <div className="flex flex-col">
                              {["A", "B", "C", "D", "E", "F", "G", "H", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((letter, idx) => (
                                <div key={idx} className="text-4xl font-bold text-slate-800 h-20 sm:h-24 flex items-center justify-center">
                                  {letter}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-4xl sm:text-5xl font-bold text-slate-900">
                              {char}
                            </div>
                          )}
                        </div>
                        {/* Reel Highlight */}
                        {reelStates[i] === "stopped" && (
                          <div className="absolute inset-0 border-4 border-green-500 rounded-md pointer-events-none animate-pulse"></div>
                        )}
                      </div>
                      {/* Reel Number */}
                      <div className="text-yellow-300 text-xs font-bold mt-2">#{i + 1}</div>
                    </div>
                  ))}
                </div>
                
                {/* Winner Reveal Message */}
                {showWinnerReveal && (
                  <div className="winner-reveal">
                    <div className="pixel-card bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-3 rounded-lg border-4 border-yellow-600 mb-2">
                      <div className="text-white text-xl sm:text-2xl font-bold">🏆 WINNER DRAWN! 🏆</div>
                    </div>
                    <div className="text-cyan-300 text-sm font-bold">
                      Wallet: {winnerAddress.slice(0, 8)}...
                    </div>
                  </div>
                )}
              </div>
              
              {/* Slot Machine Lever */}
              <div className="flex justify-end pr-4">
                <div className={`w-4 h-24 bg-red-900 rounded-full border-4 border-red-950 relative ${leverPulled ? 'lever-pull' : ''}`}>
                  <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-yellow-500 rounded-full border-4 border-yellow-600"></div>
                </div>
              </div>
              
              {/* Machine Bottom */}
              <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 px-4 py-2 rounded-b-lg border-4 border-yellow-800 mt-4">
                <div className="text-red-900 text-xs font-bold">GOOD LUCK!</div>
              </div>
            </div>
            
            {/* Spinning Status */}
            {!showWinnerReveal && (
              <div className="text-cyan-300 text-sm mt-6 animate-pulse">
                Spinning the reels...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading Screen */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 bg-opacity-95">
          <div className="text-center">
            <div className="text-cyan-300 text-3xl font-bold mb-6 animate-pulse">⚡ LOADING...</div>
            <div className="w-64 h-8 bg-slate-900 border-4 border-slate-800 pixel-card overflow-hidden rounded-lg">
              <div className="mining-progress h-full bg-gradient-to-r from-blue-600 to-purple-600"></div>
            </div>
            <div className="text-slate-400 text-sm mt-4 animate-pulse">Processing transaction...</div>
          </div>
        </div>
      )}

      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-bounce">
            <PixelTrophyIcon className="w-32 h-32 text-yellow-400 animate-pulse" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="pixel-card bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white text-4xl sm:text-6xl font-bold px-12 py-8 rounded-2xl shadow-2xl animate-pulse border-4 border-yellow-600">
              🏆 YOU WON! 🏆
            </div>
          </div>
          {/* Confetti Effect */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-fall"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-10%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 3}s`,
                }}
              >
                <span className="text-4xl">
                  {[<PixelTrophyIcon className="w-8 h-8 text-yellow-400" />, <PixelCoinIcon className="w-8 h-8 text-yellow-500" />, <PixelStarIcon className="w-8 h-8 text-blue-400" />, <PixelTicketIcon className="w-8 h-8 text-orange-400" />][Math.floor(Math.random() * 4)]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Improved XP Bar Section with Rounded Pixels and Blue/Purple Theme */}
        {connected && (
          <div className="pixel-card bg-gradient-to-r from-slate-800 to-slate-700 bg-opacity-95 p-4 mb-6 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <PixelTrophyIcon className="w-6 h-6 text-blue-400" />
                  <div className="text-blue-300 font-bold text-sm">Rank {rank}</div>
                </div>
                <button 
                  onClick={() => setShowLoots(!showLoots)}
                  className="crt-hover pixel-card px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs rounded-md hover:from-purple-500 hover:to-blue-500 transition-all flex items-center gap-2"
                >
                  <PixelTicketIcon className="w-4 h-4" />
                  <span>Loots ({userTickets.length})</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <PixelStarIcon className="w-5 h-5 text-purple-400" />
                <div className="text-purple-300 text-xs font-bold">Badges: {badges.length}</div>
              </div>
            </div>
            <div className="w-full h-8 bg-slate-900 border-3 border-slate-950 rounded-lg overflow-hidden shadow-inner">
              <div 
                className="pixel-progress-bar h-full transition-all duration-500"
                style={{width: `${(points / (rank * 100)) * 100}%`}}
              >
                <div className="text-white text-xs text-center leading-8 font-bold drop-shadow-lg">
                  {points} / {rank * 100} Points
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loots Inventory Modal */}
        {showLoots && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80" onClick={() => setShowLoots(false)}>
            <div className="pixel-card bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-lg max-w-2xl w-full mx-4 border-4 border-blue-500" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-cyan-300 text-xl font-bold flex items-center gap-3">
                  <PixelTicketIcon className="w-8 h-8 text-yellow-400" />
                  Your Ticket Loots
                </h2>
                <button 
                  onClick={() => setShowLoots(false)}
                  className="crt-hover pixel-card px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-all"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-96 overflow-y-auto">
                {userTickets.length === 0 ? (
                  <div className="col-span-full text-center text-cyan-400 py-8">
                    <PixelTicketIcon className="w-16 h-16 mx-auto mb-3 opacity-50" />
                    <p>No tickets yet! Buy some to fill your loots! 🎟️</p>
                  </div>
                ) : (
                  userTickets.map((ticket, i) => (
                    <div 
                      key={i}
                      className="crt-hover pixel-card bg-gradient-to-br from-yellow-600 to-orange-600 p-3 rounded-md aspect-square flex items-center justify-center border-2 border-yellow-700 hover:scale-110 transition-transform"
                    >
                      <div className="text-center">
                        <PixelTicketIcon className="w-8 h-8 mx-auto mb-1 text-yellow-100" />
                        <div className="text-white text-xs font-bold">#{ticket.account.ticketNumber}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl sm:text-4xl font-bold text-white pixel-card" style={{
            textShadow: '4px 4px 0 rgba(0,0,0,0.5)',
            background: 'linear-gradient(180deg, #3b82f6 0%, #8b5cf6 100%)',
            padding: '12px 20px',
            border: '4px solid #1e40af',
            boxShadow: '0 6px 0 0 #1e3a8a, 0 0 20px rgba(59, 130, 246, 0.5)',
            borderRadius: '4px'
          }}>
            🎰 PIXEL RAFFLE
          </h1>
          <div className="flex items-center gap-4">
            {status && (
              <span className="crt-hover text-xs sm:text-sm text-cyan-300 animate-pulse px-4 py-2 bg-black bg-opacity-70 border-2 border-cyan-500 pixel-card rounded-md shadow-lg">
                {status}
              </span>
            )}
          </div>
        </div>

        {!connected ? (
          <div className="text-center py-20">
            <div className="pixel-card bg-gradient-to-br from-slate-800 to-slate-900 p-8 inline-block border-4 border-blue-500 rounded-lg">
              <PixelHomeIcon className="w-16 h-16 mx-auto mb-4 text-blue-400" />
              <p className="text-xl text-cyan-300 mb-4" style={{textShadow: '2px 2px 0 rgba(0,0,0,0.5)'}}>
                Connect your wallet to start!
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* New Pixel Form Style */}
            <div className={`pixel-form p-6 shadow-2xl ${formError ? 'pixel-shake' : ''}`}>
              <h2 className="text-xl font-bold mb-6 text-cyan-300 flex items-center gap-3" style={{textShadow: '2px 2px 0 rgba(0,0,0,0.7)'}}>
                <PixelPrizeIcon className="w-8 h-8 text-purple-400" />
                Create New Raffle
              </h2>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm text-cyan-200 mb-3 font-bold flex items-center gap-2">
                    <PixelClockIcon className="w-5 h-5 text-blue-400" />
                    Raffle Duration (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={durationMinutes}
                    onChange={(e) => {
                      setDurationMinutes(parseInt(e.target.value) || 60);
                      setFormError(false);
                    }}
                    className="crt-hover w-full px-4 py-3 bg-slate-900 border-3 border-blue-500 rounded-md text-cyan-100 font-mono focus:border-cyan-400 focus:outline-none pixel-card shadow-inner"
                    placeholder="60"
                  />
                  <p className="text-xs text-blue-400 mt-2 font-bold flex items-center gap-2">
                    <PixelClockIcon className="w-4 h-4" />
                    {durationMinutes < 60 ? `${durationMinutes} minutes` : 
                     durationMinutes === 60 ? '1 hour' : 
                     durationMinutes < 1440 ? `${Math.floor(durationMinutes / 60)} hours ${durationMinutes % 60 ? `${durationMinutes % 60}m` : ''}` : 
                     `${Math.floor(durationMinutes / 1440)} days`}
                  </p>
                </div>
                <button
                  onClick={closeMyRaffle}
                  className="crt-hover pixel-card px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 rounded-md font-bold hover:from-red-500 hover:to-red-600 shadow-lg whitespace-nowrap text-white border-2 border-red-800 transition-all"
                >
                  🗑️ Close Old
                </button>
                <button
                  onClick={initializeRaffle}
                  className="crt-hover pixel-card px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-md font-bold hover:from-green-500 hover:to-emerald-500 shadow-lg whitespace-nowrap text-white border-2 border-green-800 transition-all"
                >
                  ✨ Create New
                </button>
              </div>
            </div>

            {programError && (
              <div className="pixel-card bg-red-900 bg-opacity-90 border-4 border-red-950 p-4 rounded-md text-red-200">
                ⚠️ Error: {programError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {raffles.map((raffle) => {
                const account = raffle.account;
                const endTime = new Date(account.endTs.toNumber() * 1000);
                const isEnded = currentTime > endTime.getTime();
                const timeLeft = Math.max(0, Math.floor((endTime.getTime() - currentTime) / 1000));

                const isWinner = raffle.winnerAddress === publicKey?.toString();
                const isCreator = account.creator.toString() === publicKey?.toString();

                return (
                  <div 
                    key={raffle.publicKey.toString()} 
                    className={`crt-hover pixel-card bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 shadow-2xl border-3 transition-all hover:scale-105 ${
                      !isEnded ? 'pixel-glow-active' : 'border-slate-700'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs font-mono bg-black bg-opacity-60 px-3 py-1 rounded-md text-cyan-400 border-2 border-slate-700">
                        {raffle.publicKey.toString().slice(0, 8)}...
                      </span>
                      <span className={`neon-badge px-3 py-1 rounded-md text-xs font-bold border-2 ${
                        isEnded 
                          ? 'bg-red-900 text-red-200 border-red-700' 
                          : 'bg-green-900 text-green-200 border-green-500'
                      }`}>
                        {isEnded ? '❌ CLOSED' : '✅ ACTIVE'}
                      </span>
                    </div>

                    {/* Prize Icon */}
                    <div className="flex justify-center mb-4">
                      <div className="pixel-card bg-gradient-to-br from-purple-600 to-blue-600 p-4 rounded-lg">
                        <PixelPrizeIcon className="w-12 h-12 text-yellow-300" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="space-y-3 mb-6">
                      <div className="crt-hover flex justify-between items-center bg-slate-900 bg-opacity-80 p-3 border-2 border-slate-700 rounded-md">
                        <span className="text-cyan-300 font-bold flex items-center gap-2">
                          <PixelCoinIcon className="w-5 h-5" />
                          Price
                        </span>
                        <span className="font-bold text-cyan-100">
                          {(account.ticketPrice.toNumber() / 1_000_000_000).toFixed(2)} SOL
                        </span>
                      </div>
                      <div className="crt-hover flex justify-between items-center bg-slate-900 bg-opacity-80 p-3 border-2 border-slate-700 rounded-md">
                        <span className="text-cyan-300 font-bold flex items-center gap-2">
                          <PixelTicketIcon className="w-5 h-5" />
                          Sold
                        </span>
                        <span className="ticket-count-animate font-bold text-cyan-100">
                          {account.ticketCount}
                        </span>
                      </div>
                      
                      {/* Pixel Timer Bar */}
                      <div className="crt-hover bg-slate-900 bg-opacity-80 p-3 border-2 border-slate-700 rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-cyan-300 font-bold flex items-center gap-2">
                            <PixelClockIcon className="w-5 h-5" />
                            Time Left
                          </span>
                          <span className="font-mono text-lime-400 font-bold">
                            {Math.floor(timeLeft / 60)}m {timeLeft % 60}s
                          </span>
                        </div>
                        {!isEnded && (
                          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                            <div 
                              className="pixel-timer-bar h-full"
                              style={{
                                width: `${Math.max(0, Math.min(100, (timeLeft / (durationMinutes * 60)) * 100))}%`,
                                transition: 'width 1s linear'
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Winner Display */}
                      {account.winner !== null && (
                        <div className="crt-hover flex flex-col gap-2 bg-gradient-to-r from-yellow-900 to-orange-900 bg-opacity-60 p-3 rounded-md border-2 border-yellow-600">
                          <div className="flex justify-between items-center">
                            <span className="text-yellow-200 text-sm font-bold flex items-center gap-2">
                              <PixelTrophyIcon className="w-5 h-5" />
                              Winner Ticket
                            </span>
                            <span className="font-bold text-lime-400">#{account.winner}</span>
                          </div>
                          {raffle.winnerAddress && (
                            <div className="flex justify-between items-center">
                              <span className="text-yellow-200 text-sm font-bold">👤 Winner</span>
                              <span className={`font-bold text-xs ${isWinner ? 'text-lime-400' : 'text-orange-400'}`}>
                                {isWinner ? '(YOU) ' : ''}
                                {raffle.winnerAddress.slice(0, 6)}...{raffle.winnerAddress.slice(-4)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => buyTicket(raffle)}
                        disabled={isEnded}
                        className="crt-hover pixel-card col-span-2 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed rounded-md font-bold transition-all text-white border-2 border-emerald-800 disabled:border-slate-800 flex items-center justify-center gap-2"
                      >
                        <PixelTicketIcon className="w-5 h-5" />
                        Buy Ticket
                      </button>
                      {isEnded && !account.winner && isCreator && (
                        <button
                          onClick={() => drawWinner(raffle)}
                          className="crt-hover pixel-card col-span-2 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-md font-bold transition-all shadow-lg text-white border-2 border-yellow-800 flex items-center justify-center gap-2"
                        >
                          🎡 Draw Winner
                        </button>
                      )}
                      {isEnded && account.winner !== null && (
                        <button
                          onClick={() => claimPrize(raffle)}
                          disabled={!isWinner || account.prizeClaimed}
                          className={`crt-hover pixel-card col-span-2 py-3 rounded-md font-bold transition-all border-2 flex items-center justify-center gap-2 ${
                            account.prizeClaimed
                              ? 'bg-slate-700 text-slate-400 cursor-not-allowed border-slate-800'
                              : isWinner
                              ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white border-orange-800'
                              : 'bg-slate-700 text-slate-400 cursor-not-allowed border-slate-800'
                            }`}
                        >
                          {account.prizeClaimed ? (
                            <>
                              <PixelHeartIcon className="w-5 h-5" />
                              Prize Claimed
                            </>
                          ) : isWinner ? (
                            <>
                              <PixelTrophyIcon className="w-5 h-5" />
                              Claim Prize
                            </>
                          ) : (
                            '❌ Not Winner'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {raffles.length === 0 && (
              <div className="text-center py-10">
                <div className="pixel-card bg-gradient-to-br from-slate-800 to-slate-900 p-8 inline-block border-4 border-blue-500 rounded-lg">
                  <PixelPrizeIcon className="w-16 h-16 mx-auto mb-4 text-purple-400 opacity-50" />
                  <p className="text-cyan-300 font-bold" style={{textShadow: '2px 2px 0 rgba(0,0,0,0.5)'}}>
                    No raffles found. Create one to get started! 🎰
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}