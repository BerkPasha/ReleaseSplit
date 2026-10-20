// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ReleaseSplit
/// @notice Noncustodial USDC escrow with automatic payment splitting for Arc Testnet.
/// @dev USDC on Arc is a fixed predeploy ERC-20 at 0x3600000000000000000000000000000000000000.
///      Native gas is also USDC (18-decimal), but this contract only uses the 6-decimal ERC-20 view.
contract ReleaseSplit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------
    // Types
    // ---------------------------------------------------------

    enum DealState {
        Created,  // 0 — deal created, not yet funded
        Funded,   // 1 — USDC deposited, awaiting release or refund deadline
        Released, // 2 — funds distributed to recipients
        Refunded  // 3 — funds returned to payer after deadline
    }

    struct Deal {
        address payer;
        address approver;
        // recipients[i] / bps[i] are parallel arrays; unused slots are zero
        address[3] recipientWallets;
        uint16[3] recipientBps;   // basis points out of 10000
        uint8  recipientCount;    // 2 or 3
        uint256 amount;           // USDC in 6-decimal units
        uint256 deadline;         // unix timestamp
        DealState state;
    }

    // ---------------------------------------------------------
    // Errors
    // ---------------------------------------------------------

    error NotPayer();
    error NotApprover();
    error WrongState();
    error DeadlineNotPassed();
    error DeadlinePassed();
    error InvalidRecipientCount();
    error ZeroAddress();
    error DuplicateAddress();
    error InvalidBps();
    error ZeroAmount();
    error InvalidDeadline();

    // ---------------------------------------------------------
    // Events
    // ---------------------------------------------------------

    event DealCreated(
        uint256 indexed dealId,
        address indexed payer,
        address indexed approver,
        uint256 amount,
        uint256 deadline
    );
    event DealFunded(uint256 indexed dealId);
    event DealReleased(uint256 indexed dealId);
    event DealRefunded(uint256 indexed dealId);

    // ---------------------------------------------------------
    // Constants
    // ---------------------------------------------------------

    /// @dev Arc USDC ERC-20 predeploy address (same on mainnet and testnet).
    address private constant USDC_ADDRESS = 0x3600000000000000000000000000000000000000;
    IERC20  private constant USDC = IERC20(USDC_ADDRESS);
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------
    // State
    // ---------------------------------------------------------

    uint256 public dealCount;
    mapping(uint256 => Deal) private _deals;

    // ---------------------------------------------------------
    // Functions
    // ---------------------------------------------------------

    /// @notice Create a new escrow deal.
    /// @param approver      Address allowed to release funds (before deadline).
    /// @param wallets       Parallel array of 2 or 3 recipient wallet addresses.
    /// @param bps           Parallel array of basis-point splits for each recipient, summing to 10000.
    /// @param amount        USDC amount to escrow (6-decimal units; must be > 0).
    /// @param deadline      Unix timestamp after which only the payer may refund (must be in the future).
    /// @return dealId       The ID of the newly created deal.
    function createDeal(
        address approver,
        address[] calldata wallets,
        uint16[]  calldata bps,
        uint256 amount,
        uint256 deadline
    ) external returns (uint256 dealId) {
        uint256 n = wallets.length;
        if (n != 2 && n != 3)          revert InvalidRecipientCount();
        if (bps.length != n)            revert InvalidRecipientCount();
        if (approver == address(0))     revert ZeroAddress();
        if (approver == msg.sender)     revert DuplicateAddress();
        if (amount == 0)                revert ZeroAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        uint256 totalBps;

        for (uint256 i = 0; i < n; ++i) {
            address w = wallets[i];
            uint16  b = bps[i];

            if (w == address(0))                 revert ZeroAddress();
            if (w == msg.sender || w == approver) revert DuplicateAddress();
            if (b == 0)                           revert InvalidBps();

            for (uint256 j = i + 1; j < n; ++j) {
                if (w == wallets[j]) revert DuplicateAddress();
            }

            totalBps += b;
        }

        if (totalBps != BPS_DENOMINATOR) revert InvalidBps();

        dealId = dealCount;
        unchecked { dealCount = dealId + 1; }

        Deal storage d = _deals[dealId];
        d.payer          = msg.sender;
        d.approver       = approver;
        d.recipientCount = uint8(n); // safe: n is 2 or 3
        d.amount         = amount;
        d.deadline       = deadline;
        d.state          = DealState.Created;

        for (uint256 i = 0; i < n; ++i) {
            d.recipientWallets[i] = wallets[i];
            d.recipientBps[i]     = bps[i];
        }

        emit DealCreated(dealId, msg.sender, approver, amount, deadline);
    }

    /// @notice Deposit USDC into escrow. Caller must have approved this contract first.
    function fundDeal(uint256 dealId) external {
        Deal storage d = _deals[dealId];

        if (msg.sender != d.payer)           revert NotPayer();
        if (d.state != DealState.Created)    revert WrongState();

        USDC.safeTransferFrom(msg.sender, address(this), d.amount);
        d.state = DealState.Funded;

        emit DealFunded(dealId);
    }

    /// @notice Release escrowed USDC to all recipients. Only callable by the approver before deadline.
    ///         First recipient absorbs any integer-division dust so no USDC is ever stranded.
    function releaseDeal(uint256 dealId) external nonReentrant {
        Deal storage d = _deals[dealId];

        if (msg.sender != d.approver)        revert NotApprover();
        if (d.state != DealState.Funded)     revert WrongState();
        if (block.timestamp > d.deadline)    revert DeadlinePassed();

        // Mark released before transfers (reentrancy guard already active, but defense-in-depth)
        d.state = DealState.Released;

        uint256 total     = d.amount;
        uint256 n         = d.recipientCount;
        uint256 remainder = total;

        // Pay recipients[1..n) first using integer division
        for (uint256 i = 1; i < n; ++i) {
            uint256 share = (total * d.recipientBps[i]) / BPS_DENOMINATOR;
            remainder -= share;
            USDC.safeTransfer(d.recipientWallets[i], share);
        }

        // Recipient[0] gets the remainder (absorbs any rounding dust)
        USDC.safeTransfer(d.recipientWallets[0], remainder);

        emit DealReleased(dealId);
    }

    /// @notice Return escrowed USDC to the payer. Only callable by the payer after deadline.
    function refundDeal(uint256 dealId) external nonReentrant {
        Deal storage d = _deals[dealId];

        if (msg.sender != d.payer)            revert NotPayer();
        if (d.state != DealState.Funded)      revert WrongState();
        if (block.timestamp <= d.deadline)    revert DeadlineNotPassed();

        d.state = DealState.Refunded;
        USDC.safeTransfer(d.payer, d.amount);

        emit DealRefunded(dealId);
    }

    // ---------------------------------------------------------
    // Views
    // ---------------------------------------------------------

    /// @notice Return full deal data.
    function getDeal(uint256 dealId) external view returns (
        address payer,
        address approver,
        address[3] memory recipientWallets,
        uint16[3]  memory recipientBps,
        uint8      recipientCount,
        uint256    amount,
        uint256    deadline,
        uint8      state   // 0=Created,1=Funded,2=Released,3=Refunded
    ) {
        Deal storage d = _deals[dealId];
        payer            = d.payer;
        approver         = d.approver;
        recipientWallets = d.recipientWallets;
        recipientBps     = d.recipientBps;
        recipientCount   = d.recipientCount;
        amount           = d.amount;
        deadline         = d.deadline;
        state            = uint8(d.state);
    }

    /// @notice Convenience read — returns the Arc USDC ERC-20 address.
    function usdcAddress() external pure returns (address) {
        return USDC_ADDRESS;
    }
}
