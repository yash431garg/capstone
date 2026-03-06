use anchor_lang::prelude::*;
use crate::state::LotteryState;
use crate::errors::LotteryError;

pub fn handler(_ctx: Context<Close>) -> Result<()> {
    // Anchor's `close` constraint transfers lamports back to authority
    // and zeroes the account data automatically.
    Ok(())
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [b"state", authority.key().as_ref()],
        bump = lottery_state.state_bump,
        has_one = authority @ LotteryError::Unauthorized,
        constraint = !lottery_state.is_active @ LotteryError::WinnerNotPicked,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    pub system_program: Program<'info, System>,
}
