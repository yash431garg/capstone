use anchor_lang::prelude::*;

declare_id!("ErJRFMPZdb32PbxopbmhmvMwxFudJD23XbfMdF8Z27AW");

#[program]
pub mod capstone {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
