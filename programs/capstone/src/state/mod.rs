use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account]
pub struct LotteryState {
    pub price: u64,       // ticket price in lamports
    pub max_tickets: u32,
    pub authority: Pubkey,
    pub end_time: i64,
    pub round: u32,
    pub winner: Pubkey,
    pub vault_bump: u8,
    pub state_bump: u8,
    pub is_active: bool,

    #[max_len(100)]
    pub players: Vec<Pubkey>,
}

#[derive(InitSpace)]
#[account]
pub struct LotteryTicket {
    pub buyer: Pubkey,
    pub lottery: Pubkey,
    pub ticket_number: u32,
    pub bump: u8,
}
