use anchor_lang::prelude::*;
use crate::state::LotteryState;

pub fn handler(ctx: Context<Init>, price: u64, max_tickets: u32, end_time: i64) -> Result<()> {
    let state = &mut ctx.accounts.lottery_state;

    state.price = price;
    state.max_tickets = max_tickets;
    state.authority = ctx.accounts.authority.key();
    state.end_time = end_time;
    state.round = 1;
    state.winner = Pubkey::default();
    state.vault_bump = ctx.bumps.vault;
    state.state_bump = ctx.bumps.lottery_state;
    state.is_active = true;
    state.players = Vec::new();

    Ok(())
}

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        seeds = [b"state", authority.key().as_ref()],
        bump,
        space = 8 + LotteryState::INIT_SPACE,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// CHECK: Vault PDA owned by this program that holds ticket funds
    #[account(
        mut,
        seeds = [b"vault", lottery_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}
