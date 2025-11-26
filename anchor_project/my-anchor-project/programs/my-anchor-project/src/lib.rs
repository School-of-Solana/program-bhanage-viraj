use anchor_lang::prelude::*;

declare_id!("Gxi64mihQTXmwW4PXGpNV7inGKBxrx2i9nPpUKL2iNkH");

#[program]
pub mod my_anchor_project {
    use super::*;

    pub fn initialize_raffle(
        ctx: Context<InitializeRaffle>,
        ticket_price: u64,
        end_ts: i64,
    ) -> Result<()> {
        let raffle = &mut ctx.accounts.raffle;

        raffle.creator = ctx.accounts.creator.key();
        raffle.ticket_price = ticket_price;
        raffle.ticket_count = 0;
        raffle.end_ts = end_ts;
        raffle.winner = None;
        raffle.prize_claimed = false;
        raffle.bump = ctx.bumps.raffle;

        Ok(())
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        let clock = Clock::get()?;
        let raffle = &mut ctx.accounts.raffle;
        let ticket = &mut ctx.accounts.ticket;

        require!(clock.unix_timestamp < raffle.end_ts, RaffleError::RaffleEnded);

        // transfer SOL to vault PDA using system program
        let lamports_required = raffle.ticket_price;
        
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, lamports_required)?;

        // Store ticket information
        ticket.buyer = ctx.accounts.buyer.key();
        ticket.ticket_number = raffle.ticket_count;
        ticket.raffle = raffle.key();
        ticket.bump = ctx.bumps.ticket;

        raffle.ticket_count += 1;

        Ok(())
    }

    pub fn draw_winner(ctx: Context<DrawWinner>) -> Result<()> {
        let clock = Clock::get()?;
        let raffle = &mut ctx.accounts.raffle;

        require!(clock.unix_timestamp >= raffle.end_ts, RaffleError::RaffleNotEnded);
        require_keys_eq!(raffle.creator, ctx.accounts.creator.key(), RaffleError::NotCreator);
        require!(raffle.ticket_count > 0, RaffleError::NoTicketsSold);
        require!(raffle.winner.is_none(), RaffleError::WinnerAlreadyDrawn);

        // generate randomness (improved but still not cryptographically secure)
        let slot = clock.slot;
        let unix_timestamp = clock.unix_timestamp as u64;
        let random = ((slot.wrapping_mul(unix_timestamp)) % u32::MAX as u64) as u32;

        let winner_ticket_number = random % raffle.ticket_count;
        
        // Store winner information
        raffle.winner = Some(winner_ticket_number);
        
        msg!("Winner ticket number: {}", winner_ticket_number);

        Ok(())
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        let raffle = &mut ctx.accounts.raffle;
        let ticket = &ctx.accounts.ticket;
        
        require!(raffle.winner.is_some(), RaffleError::WinnerNotDrawn);
        require_eq!(raffle.winner.unwrap(), ticket.ticket_number, RaffleError::NotWinner);
        require_keys_eq!(ticket.buyer, ctx.accounts.winner.key(), RaffleError::NotTicketOwner);
        require!(!raffle.prize_claimed, RaffleError::PrizeAlreadyClaimed);
        
        let vault = &ctx.accounts.vault;
        let winner = &ctx.accounts.winner;
        
        // Calculate prize (90% to winner, 10% stays for creator as fee)
        // Leave minimum rent-exempt amount in vault  
        let total_lamports = vault.lamports();
        let rent = Rent::get()?;
        let rent_exempt_minimum = rent.minimum_balance(0); // For empty account data
        let available_lamports = total_lamports.saturating_sub(rent_exempt_minimum);
        let prize_amount = (available_lamports * 9) / 10;
        
        // Transfer using system program with vault seeds
        let raffle_key = raffle.key();
        let vault_seeds = &[
            b"vault",
            raffle_key.as_ref(),
            &[ctx.bumps.vault]
        ];
        let signer_seeds = &[&vault_seeds[..]];
        
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: vault.to_account_info(),
                to: winner.to_account_info(),
            },
            signer_seeds
        );
        anchor_lang::system_program::transfer(cpi_context, prize_amount)?;
        
        // Mark prize as claimed
        raffle.prize_claimed = true;
        
        msg!("Prize of {} lamports claimed by winner!", prize_amount);
        
        Ok(())
    }

    pub fn close_raffle(ctx: Context<CloseRaffle>) -> Result<()> {
        let raffle = &ctx.accounts.raffle;
        let clock = Clock::get()?;
        
        require_keys_eq!(
            raffle.creator,
            ctx.accounts.creator.key(),
            RaffleError::NotCreator
        );
        
        // Can only close if raffle ended and either no tickets sold or prize claimed
        require!(clock.unix_timestamp >= raffle.end_ts, RaffleError::RaffleNotEnded);
        
        let vault = &ctx.accounts.vault;
        let creator = &ctx.accounts.creator;
        
        // Transfer remaining funds (creator fee or unclaimed funds) to creator
        let vault_lamports = vault.lamports();
        let rent_exempt_minimum = 890880; // typical rent-exempt minimum
        
        if vault_lamports > rent_exempt_minimum {
            let transfer_amount = vault_lamports - rent_exempt_minimum;
            
            // Use CPI to transfer from vault to creator
            let raffle_key = raffle.key();
            let vault_seeds = &[
                b"vault",
                raffle_key.as_ref(),
                &[ctx.bumps.vault]
            ];
            let signer_seeds = &[&vault_seeds[..]];
            
            let cpi_context = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: vault.to_account_info(),
                    to: creator.to_account_info(),
                },
                signer_seeds
            );
            anchor_lang::system_program::transfer(cpi_context, transfer_amount)?;
        }

        Ok(())
    }

    /// Migration instruction to fix old raffle accounts with invalid bool values
    /// This rewrites the account data with correct discriminator and structure
    pub fn migrate_raffle(ctx: Context<MigrateRaffle>) -> Result<()> {
        let old_account = &ctx.accounts.old_raffle;
        let account_info = old_account.to_account_info();
        
        // Read existing data carefully to preserve valid fields
        let data = account_info.data.borrow();
        
        // Parse existing fields (skip discriminator at [0..8])
        let mut creator_bytes = [0u8; 32];
        creator_bytes.copy_from_slice(&data[8..40]);
        let creator = Pubkey::new_from_array(creator_bytes);
        
        let ticket_price = u64::from_le_bytes(data[40..48].try_into().unwrap());
        let ticket_count = u32::from_le_bytes(data[48..52].try_into().unwrap());
        let end_ts = i64::from_le_bytes(data[52..60].try_into().unwrap());
        
        // Handle Option<u32> winner (1 byte tag + 4 bytes value)
        let winner = if data[60] == 0 {
            None
        } else {
            Some(u32::from_le_bytes(data[61..65].try_into().unwrap()))
        };
        
        // Extract bump (should be at the end)
        let bump = data[data.len() - 1];
        
        drop(data); // Release borrow
        
        // Create new raffle struct with corrected prize_claimed
        let new_raffle = Raffle {
            creator,
            ticket_price,
            ticket_count,
            end_ts,
            winner,
            prize_claimed: false, // ✅ Reset to valid boolean
            bump,
        };
        
        // 1. Serialize struct (without discriminator)
        let serialized_struct = new_raffle.try_to_vec()?;
        
        // 2. Calculate correct size (discriminator + struct)
        let new_size = 8 + serialized_struct.len();
        
        // 3. Realloc to correct size using new API
        account_info.resize(new_size)?;
        
        // 4. Borrow account data mutably
        let mut data = account_info.data.borrow_mut();
        
        // 5. Write discriminator (FIRST 8 BYTES)
        // Get discriminator bytes for Raffle account
        let disc: [u8; 8] = [143, 133, 63, 173, 138, 10, 142, 200]; // Raffle discriminator from IDL
        data[..8].copy_from_slice(&disc);
        
        // 6. Write struct bytes AFTER discriminator
        data[8..8 + serialized_struct.len()].copy_from_slice(&serialized_struct);
        
        msg!("✅ Migration successful for raffle: {}", account_info.key());
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MigrateRaffle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: This is the old raffle account that needs migration
    #[account(mut)]
    pub old_raffle: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(ticket_price: u64, end_ts: i64)]
pub struct InitializeRaffle<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"raffle_v2", creator.key().as_ref()],
        bump,
        space = 8 + 32 + 8 + 4 + 8 + 5 + 1 + 1, // discriminator + creator + ticket_price + ticket_count + end_ts + Option<u32> winner + prize_claimed + bump
    )]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: This is a PDA used as a vault for the raffle
    #[account(
        mut,
        seeds = [b"vault", raffle.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub raffle: Account<'info, Raffle>,

    #[account(
        init,
        payer = buyer,
        seeds = [b"ticket_v2", raffle.key().as_ref(), raffle.ticket_count.to_le_bytes().as_ref()],
        bump,
        space = 8 + 32 + 4 + 32 + 1,
    )]
    pub ticket: Account<'info, Ticket>,

    /// CHECK: This is a PDA used as a vault for the raffle
    #[account(
        mut,
        seeds = [b"vault", raffle.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DrawWinner<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub raffle: Account<'info, Raffle>,
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"raffle_v2", raffle.creator.as_ref()],
        bump = raffle.bump,
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        seeds = [b"ticket_v2", raffle.key().as_ref(), ticket.ticket_number.to_le_bytes().as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,

    /// CHECK: This is a PDA used as a vault for the raffle
    #[account(
        mut,
        seeds = [b"vault", raffle.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseRaffle <'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, close = creator)]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: This is a PDA used as a vault for the raffle
    #[account(
        mut,
        seeds = [b"vault", raffle.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Raffle {
    pub creator: Pubkey,
    pub ticket_price: u64,
    pub ticket_count: u32,
    pub end_ts: i64,
    pub winner: Option<u32>, // winning ticket number
    pub prize_claimed: bool,
    pub bump: u8,
}

#[account]
pub struct Ticket {
    pub buyer: Pubkey,
    pub ticket_number: u32,
    pub raffle: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum RaffleError {
    #[msg("The raffle has already ended")]
    RaffleEnded,
    #[msg("The raffle has not ended yet")]
    RaffleNotEnded,
    #[msg("Only creator can call this")]
    NotCreator,
    #[msg("No tickets were sold")]
    NoTicketsSold,
    #[msg("Winner has already been drawn")]
    WinnerAlreadyDrawn,
    #[msg("Winner has not been drawn yet")]
    WinnerNotDrawn,
    #[msg("You are not the winner")]
    NotWinner,
    #[msg("You do not own this ticket")]
    NotTicketOwner,
    #[msg("Prize has already been claimed")]
    PrizeAlreadyClaimed,
}
