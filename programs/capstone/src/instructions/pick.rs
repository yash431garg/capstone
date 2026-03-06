use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::LotteryState;
use crate::errors::LotteryError;

pub fn handler(ctx: Context<Pick>) -> Result<()> {
    let clock = Clock::get()?;

    // Snapshot values we need before any mutable borrows
    let players = ctx.accounts.lottery_state.players.clone();
    let vault_bump = ctx.accounts.lottery_state.vault_bump;
    let end_time = ctx.accounts.lottery_state.end_time;
    let is_active = ctx.accounts.lottery_state.is_active;

    require!(is_active, LotteryError::LotteryNotActive);
    require!(clock.unix_timestamp >= end_time, LotteryError::LotteryNotEnded);
    require!(!players.is_empty(), LotteryError::NoPlayers);

    // Pseudo-random selection using the most recent slot hash.
    // SlotHashes layout: [u64 length][u64 slot][u8x32 hash]...
    // The first hash value starts at byte offset 16.
    let slot_hashes_data = ctx.accounts.slot_hashes.data.borrow();
    let hash_slice: [u8; 8] = slot_hashes_data[16..24]
        .try_into()
        .map_err(|_| error!(LotteryError::NoPlayers))?;
    let rand = u64::from_le_bytes(hash_slice);
    drop(slot_hashes_data);

    let winner_index =
        (rand ^ clock.unix_timestamp as u64 ^ clock.slot) % players.len() as u64;
    let winner_key = players[winner_index as usize];

    require!(
        ctx.accounts.winner.key() == winner_key,
        LotteryError::InvalidWinner
    );

    // Snapshot the lottery state key before mutable access
    let lottery_state_key = ctx.accounts.lottery_state.key();

    // Update state
    ctx.accounts.lottery_state.winner = winner_key;
    ctx.accounts.lottery_state.is_active = false;

    // Transfer entire vault balance to winner
    let vault_balance = ctx.accounts.vault.lamports();

    let seeds: &[&[u8]] = &[b"vault", lottery_state_key.as_ref(), &[vault_bump]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.winner.to_account_info(),
            },
            &[seeds],
        ),
        vault_balance,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct Pick<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"state", authority.key().as_ref()],
        bump = lottery_state.state_bump,
        has_one = authority @ LotteryError::Unauthorized,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        seeds = [b"vault", lottery_state.key().as_ref()],
        bump = lottery_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: Winner is verified in the handler against the computed random index
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: SlotHashes sysvar used for pseudo-random winner selection
    #[account(address = anchor_lang::solana_program::sysvar::slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
