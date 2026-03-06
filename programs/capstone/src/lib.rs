use anchor_lang::prelude::*;

mod state;
mod errors;
mod instructions;

use instructions::*;

declare_id!("ErJRFMPZdb32PbxopbmhmvMwxFudJD23XbfMdF8Z27AW");

#[program]
pub mod capstone {
    use super::*;

    /// Initialize the lottery with a ticket price, max tickets, and end time.
    pub fn initialize(
        ctx: Context<Init>,
        price: u64,
        max_tickets: u32,
        end_time: i64,
    ) -> Result<()> {
        instructions::init::handler(ctx, price, max_tickets, end_time)
    }

    /// Purchase a ticket. Transfers `price` lamports to the vault and records
    /// the buyer in the lottery state and a dedicated ticket PDA.
    pub fn buy_ticket(ctx: Context<Buy>) -> Result<()> {
        instructions::buy::handler(ctx)
    }

    /// Pick a winner using on-chain pseudo-randomness (slot hashes + clock).
    /// Transfers the entire vault balance to the winner.
    /// Can only be called after `end_time` has passed.
    pub fn pick_winner(ctx: Context<Pick>) -> Result<()> {
        instructions::pick::handler(ctx)
    }

    /// Close the lottery state account and reclaim rent.
    /// Can only be called once the lottery is no longer active.
    pub fn close_lottery(ctx: Context<Close>) -> Result<()> {
        instructions::close::handler(ctx)
    }
}
