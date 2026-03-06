use anchor_lang::prelude::*;

#[error_code]
pub enum LotteryError {
    #[msg("Lottery is full - maximum tickets have been sold")]
    LotteryFull,

    #[msg("Lottery has not ended yet")]
    LotteryNotEnded,

    #[msg("No players have entered the lottery")]
    NoPlayers,

    #[msg("Unauthorized: only the authority can call this")]
    Unauthorized,

    #[msg("Lottery is not active")]
    LotteryNotActive,

    #[msg("Winner has not been picked yet — close requires an inactive lottery")]
    WinnerNotPicked,

    #[msg("Invalid winner account provided")]
    InvalidWinner,
}
