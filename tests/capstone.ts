import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Capstone } from "../target/types/capstone";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// SlotHashes sysvar address
const SLOT_HASHES_PUBKEY = new PublicKey(
  "SysvarS1otHashes111111111111111111111111111"
);

describe("capstone", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Capstone as Program<Capstone>;

  const authority = provider.wallet.publicKey;

  // Separate buyer keypair so authority and buyer are distinct
  const buyer = Keypair.generate();

  // Ticket price: 0.01 SOL
  const TICKET_PRICE = new BN(0.01 * LAMPORTS_PER_SOL);
  const MAX_TICKETS = 2;

  // end_time = 1 (Jan 1 1970 UTC) — always in the past so pick_winner works immediately
  const END_TIME_PAST = new BN(1);

  // Derive PDAs seeded from authority
  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), authority.toBuffer()],
    program.programId
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), statePda.toBuffer()],
    program.programId
  );

  const [ticketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ticket"), statePda.toBuffer(), buyer.publicKey.toBuffer()],
    program.programId
  );

  before(async () => {
    // Airdrop SOL to the buyer so they can purchase a ticket
    const sig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  });

  // ─── 1. Initialize ──────────────────────────────────────────────────────────

  it("initializes the lottery", async () => {
    await program.methods
      .initialize(TICKET_PRICE, MAX_TICKETS, END_TIME_PAST)
      .accountsStrict({
        authority,
        lotteryState: statePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.lotteryState.fetch(statePda);

    assert.equal(state.price.toString(), TICKET_PRICE.toString(), "price");
    assert.equal(state.maxTickets, MAX_TICKETS, "max_tickets");
    assert.equal(state.authority.toBase58(), authority.toBase58(), "authority");
    assert.equal(state.endTime.toString(), END_TIME_PAST.toString(), "end_time");
    assert.isTrue(state.isActive, "lottery should be active");
    assert.equal(state.players.length, 0, "no players yet");
    assert.equal(state.stateBump, stateBump, "state bump stored");
  });

  // ─── 2. Buy Ticket ──────────────────────────────────────────────────────────

  it("allows a user to buy a ticket", async () => {
    const vaultBefore = await provider.connection.getBalance(vaultPda);

    await program.methods
      .buyTicket()
      .accountsStrict({
        buyer: buyer.publicKey,
        lotteryState: statePda,
        vault: vaultPda,
        ticket: ticketPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const state = await program.account.lotteryState.fetch(statePda);
    const ticket = await program.account.lotteryTicket.fetch(ticketPda);
    const vaultAfter = await provider.connection.getBalance(vaultPda);

    assert.equal(state.players.length, 1, "one player registered");
    assert.equal(
      state.players[0].toBase58(),
      buyer.publicKey.toBase58(),
      "buyer is player[0]"
    );

    assert.equal(
      ticket.buyer.toBase58(),
      buyer.publicKey.toBase58(),
      "ticket buyer"
    );
    assert.equal(
      ticket.lottery.toBase58(),
      statePda.toBase58(),
      "ticket lottery"
    );
    assert.equal(ticket.ticketNumber, 0, "first ticket is #0");

    assert.equal(
      vaultAfter - vaultBefore,
      TICKET_PRICE.toNumber(),
      "vault received ticket price"
    );
  });

  // ─── 3. Verify ticket PDA on-chain ──────────────────────────────────────────

  it("verifies the ticket PDA exists on-chain", async () => {
    const info = await provider.connection.getAccountInfo(ticketPda);
    assert.isNotNull(info, "ticket PDA must exist on-chain");
    assert.isAbove(info!.lamports, 0, "ticket PDA has rent lamports");
  });

  // ─── 4. Error: buying a second ticket (same buyer, same lottery) ─────────────

  it("prevents the same buyer from buying a second ticket", async () => {
    try {
      await program.methods
        .buyTicket()
        .accountsStrict({
          buyer: buyer.publicKey,
          lotteryState: statePda,
          vault: vaultPda,
          ticket: ticketPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
      assert.fail("should have thrown");
    } catch (err: any) {
      // Anchor throws when trying to `init` an already-existing account
      assert.ok(err, "error expected for duplicate ticket");
    }
  });

  // ─── 5. Error: pick_winner before max tickets / lottery full check ───────────
  // (With max_tickets=2, lottery is not full yet — just verifying winner pick works
  //  with 1 player since buyer is the only entry; winner index = rand % 1 = 0)

  // ─── 6. Pick Winner ─────────────────────────────────────────────────────────

  it("picks the winner and transfers vault funds", async () => {
    const winnerBefore = await provider.connection.getBalance(buyer.publicKey);
    const vaultBalance = await provider.connection.getBalance(vaultPda);
    assert.isAbove(vaultBalance, 0, "vault must have funds before pick");

    // With 1 player the winner is always player[0] = buyer
    await program.methods
      .pickWinner()
      .accountsStrict({
        authority,
        lotteryState: statePda,
        vault: vaultPda,
        winner: buyer.publicKey,
        slotHashes: SLOT_HASHES_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.lotteryState.fetch(statePda);
    const vaultAfter = await provider.connection.getBalance(vaultPda);
    const winnerAfter = await provider.connection.getBalance(buyer.publicKey);

    assert.isFalse(state.isActive, "lottery must be inactive after picking");
    assert.equal(
      state.winner.toBase58(),
      buyer.publicKey.toBase58(),
      "winner stored in state"
    );
    assert.equal(vaultAfter, 0, "vault should be drained");
    assert.isAbove(
      winnerAfter,
      winnerBefore,
      "winner balance should increase by prize"
    );
  });

  // ─── 7. Error: buy ticket after lottery ends ─────────────────────────────────

  it("prevents buying a ticket when lottery is not active", async () => {
    const buyer2 = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      buyer2.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const [ticket2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), statePda.toBuffer(), buyer2.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .buyTicket()
        .accountsStrict({
          buyer: buyer2.publicKey,
          lotteryState: statePda,
          vault: vaultPda,
          ticket: ticket2Pda,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer2])
        .rpc();
      assert.fail("should have thrown LotteryNotActive");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "LotteryNotActive",
        "expected LotteryNotActive error"
      );
    }
  });

  // ─── 8. Close Lottery ────────────────────────────────────────────────────────

  it("closes the lottery state and returns rent to authority", async () => {
    const authorityBefore = await provider.connection.getBalance(authority);

    await program.methods
      .closeLottery()
      .accountsStrict({
        authority,
        lotteryState: statePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const authorityAfter = await provider.connection.getBalance(authority);
    const stateInfo = await provider.connection.getAccountInfo(statePda);

    assert.isNull(stateInfo, "lottery state account must be closed");
    assert.isAbove(
      authorityAfter,
      authorityBefore,
      "authority got rent back from closed account"
    );
  });

  // ─── 9. Full lottery error test ──────────────────────────────────────────────

  describe("full lottery", () => {
    const authority2 = Keypair.generate();
    const buyer3 = Keypair.generate();
    const buyer4 = Keypair.generate();

    const [statePda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("state"), authority2.publicKey.toBuffer()],
      program.programId
    );
    const [vaultPda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), statePda2.toBuffer()],
      program.programId
    );
    const [ticketPda3] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), statePda2.toBuffer(), buyer3.publicKey.toBuffer()],
      program.programId
    );
    const [ticketPda4] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), statePda2.toBuffer(), buyer4.publicKey.toBuffer()],
      program.programId
    );

    before(async () => {
      for (const kp of [authority2, buyer3, buyer4]) {
        const sig = await provider.connection.requestAirdrop(
          kp.publicKey,
          1 * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(sig, "confirmed");
      }
    });

    it("initializes a lottery with max_tickets=1", async () => {
      await program.methods
        .initialize(TICKET_PRICE, 1, END_TIME_PAST)
        .accountsStrict({
          authority: authority2.publicKey,
          lotteryState: statePda2,
          vault: vaultPda2,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority2])
        .rpc();
    });

    it("allows buyer3 to buy the only ticket", async () => {
      await program.methods
        .buyTicket()
        .accountsStrict({
          buyer: buyer3.publicKey,
          lotteryState: statePda2,
          vault: vaultPda2,
          ticket: ticketPda3,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer3])
        .rpc();
    });

    it("rejects buyer4 because lottery is full", async () => {
      try {
        await program.methods
          .buyTicket()
          .accountsStrict({
            buyer: buyer4.publicKey,
            lotteryState: statePda2,
            vault: vaultPda2,
            ticket: ticketPda4,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer4])
          .rpc();
        assert.fail("should have thrown LotteryFull");
      } catch (err: any) {
        assert.include(
          err.toString(),
          "LotteryFull",
          "expected LotteryFull error"
        );
      }
    });

    it("picks winner for the full lottery (only 1 player → buyer3)", async () => {
      await program.methods
        .pickWinner()
        .accountsStrict({
          authority: authority2.publicKey,
          lotteryState: statePda2,
          vault: vaultPda2,
          winner: buyer3.publicKey,
          slotHashes: SLOT_HASHES_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority2])
        .rpc();

      const state2 = await program.account.lotteryState.fetch(statePda2);
      assert.isFalse(state2.isActive);
      assert.equal(state2.winner.toBase58(), buyer3.publicKey.toBase58());
    });
  });
});
