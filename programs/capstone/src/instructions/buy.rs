use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{LotteryState, LotteryTicket};
use crate::errors::LotteryError;

pub fn handler(ctx: Context<Buy>) -> Result<()> {
    // Snapshot values before taking a mutable borrow
    let lottery_key = ctx.accounts.lottery_state.key();
    let price = ctx.accounts.lottery_state.price;
    let is_active = ctx.accounts.lottery_state.is_active;
    let players_len = ctx.accounts.lottery_state.players.len();
    let max_tickets = ctx.accounts.lottery_state.max_tickets;
    let buyer_key = ctx.accounts.buyer.key();

    require!(is_active, LotteryError::LotteryNotActive);
    require!(players_len < max_tickets as usize, LotteryError::LotteryFull);

    // Transfer ticket price from buyer to vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        price,
    )?;

    // Record buyer in the ticket PDA
    let ticket = &mut ctx.accounts.ticket;
    ticket.buyer = buyer_key;
    ticket.lottery = lottery_key;
    ticket.ticket_number = players_len as u32;
    ticket.bump = ctx.bumps.ticket;

    // Add buyer to the players list in state
    ctx.accounts.lottery_state.players.push(buyer_key);

    Ok(())
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"state", lottery_state.authority.as_ref()],
        bump = lottery_state.state_bump,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        seeds = [b"vault", lottery_state.key().as_ref()],
        bump = lottery_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    // One ticket PDA per buyer per lottery — prevents double buying
    #[account(
        init,
        payer = buyer,
        seeds = [b"ticket", lottery_state.key().as_ref(), buyer.key().as_ref()],
        bump,
        space = 8 + LotteryTicket::INIT_SPACE,
    )]
    pub ticket: Account<'info, LotteryTicket>,

    pub system_program: Program<'info, System>,
}
