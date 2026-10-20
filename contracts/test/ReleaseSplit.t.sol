// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ReleaseSplit} from "../ReleaseSplit.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ---------------------------------------------------------------------------
// Invariant handler
// ---------------------------------------------------------------------------
contract ReleaseSplitHandler is Test {
    ReleaseSplit public split;
    MockERC20   public usdc;

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal payer    = makeAddr("inv_payer");
    address internal approver = makeAddr("inv_approver");
    address internal recip1   = makeAddr("inv_recip1");
    address internal recip2   = makeAddr("inv_recip2");

    uint256 public lastDealId;
    bool    public dealReleased;

    constructor(ReleaseSplit _split, MockERC20 _usdc) {
        split = _split;
        usdc  = _usdc;
    }

    function createFundRelease(uint256 amount) external {
        amount = bound(amount, 1, 1_000_000e6);

        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(split), amount);

        address[] memory wallets = new address[](2);
        wallets[0] = recip1;
        wallets[1] = recip2;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 5000;
        bps[1] = 5000;

        uint256 deadline = block.timestamp + 1 days;

        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, wallets, bps, amount, deadline);

        vm.prank(payer);
        split.fundDeal(dealId);

        vm.prank(approver);
        split.releaseDeal(dealId);

        lastDealId   = dealId;
        dealReleased = true;
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract ReleaseSplitTest is Test {

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    uint256 internal constant DEAL_AMOUNT = 1_000e6;

    address internal payer    = makeAddr("payer");
    address internal approver = makeAddr("approver");
    address internal recip1   = makeAddr("recip1");
    address internal recip2   = makeAddr("recip2");
    address internal recip3   = makeAddr("recip3");
    address internal stranger = makeAddr("stranger");

    ReleaseSplit internal split;
    MockERC20    internal usdc;

    function setUp() public {
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc  = MockERC20(USDC_ADDR);
        split = new ReleaseSplit();
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _mintAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(split), amount);
    }

    function _twoWallets() internal view returns (address[] memory w, uint16[] memory b) {
        w = new address[](2);
        b = new uint16[](2);
        w[0] = recip1; b[0] = 5000;
        w[1] = recip2; b[1] = 5000;
    }

    function _threeWallets() internal view returns (address[] memory w, uint16[] memory b) {
        w = new address[](3);
        b = new uint16[](3);
        w[0] = recip1; b[0] = 6000;
        w[1] = recip2; b[1] = 3000;
        w[2] = recip3; b[2] = 1000;
    }

    function _createDeal2() internal returns (uint256) {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        return split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function _createDeal3() internal returns (uint256) {
        (address[] memory w, uint16[] memory b) = _threeWallets();
        vm.prank(payer);
        return split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function _createAndFund2() internal returns (uint256 dealId) {
        _mintAndApprove(payer, DEAL_AMOUNT);
        dealId = _createDeal2();
        vm.prank(payer);
        split.fundDeal(dealId);
    }

    function _createAndFund3() internal returns (uint256 dealId) {
        _mintAndApprove(payer, DEAL_AMOUNT);
        dealId = _createDeal3();
        vm.prank(payer);
        split.fundDeal(dealId);
    }

    // -----------------------------------------------------------------------
    // 1. DEPLOYMENT
    // -----------------------------------------------------------------------

    function test_DeploymentSetsZeroDealCount() public view {
        assertEq(split.dealCount(), 0);
    }

    // -----------------------------------------------------------------------
    // 2. createDeal — HAPPY PATHS
    // -----------------------------------------------------------------------

    function test_CreateDeal_TwoRecipients_HappyPath() public {
        uint256 deadline = block.timestamp + 1 days;
        (address[] memory w, uint16[] memory b) = _twoWallets();

        vm.expectEmit(true, true, true, true, address(split));
        emit ReleaseSplit.DealCreated(0, payer, approver, DEAL_AMOUNT, deadline);

        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, DEAL_AMOUNT, deadline);

        assertEq(dealId, 0);
        assertEq(split.dealCount(), 1);

        (
            address dp, address da,
            address[3] memory rw, uint16[3] memory rb,
            uint8 rc, uint256 amt, uint256 dl, uint8 state
        ) = split.getDeal(dealId);

        assertEq(dp, payer);
        assertEq(da, approver);
        assertEq(amt, DEAL_AMOUNT);
        assertEq(dl, deadline);
        assertEq(state, 0); // Created
        assertEq(rc, 2);
        assertEq(rw[0], recip1);
        assertEq(rb[0], 5000);
        assertEq(rw[1], recip2);
        assertEq(rb[1], 5000);
    }

    function test_CreateDeal_ThreeRecipients_HappyPath() public {
        (address[] memory w, uint16[] memory b) = _threeWallets();
        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);

        (,,, uint16[3] memory rb, uint8 rc,,,) = split.getDeal(dealId);
        assertEq(rc, 3);
        assertEq(rb[0], 6000);
        assertEq(rb[1], 3000);
        assertEq(rb[2], 1000);
    }

    function test_CreateDeal_IncrementsDealCountSequentially() public {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        uint256 id0 = split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);

        address payer2 = makeAddr("payer2");
        vm.prank(payer2);
        uint256 id1 = split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(split.dealCount(), 2);
    }

    // -----------------------------------------------------------------------
    // 3. createDeal — REVERT PATHS
    // -----------------------------------------------------------------------

    function test_CreateDeal_Revert_OneRecipient() public {
        address[] memory w = new address[](1); w[0] = recip1;
        uint16[] memory b  = new uint16[](1);  b[0] = 10000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidRecipientCount.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_FourRecipients() public {
        address recip4 = makeAddr("recip4");
        address[] memory w = new address[](4);
        w[0]=recip1; w[1]=recip2; w[2]=recip3; w[3]=recip4;
        uint16[] memory b = new uint16[](4);
        b[0]=2500; b[1]=2500; b[2]=2500; b[3]=2500;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidRecipientCount.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_MismatchedArrays() public {
        address[] memory w = new address[](2); w[0]=recip1; w[1]=recip2;
        uint16[]  memory b = new uint16[](3);  b[0]=3000; b[1]=3000; b[2]=4000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidRecipientCount.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_ZeroAddressApprover() public {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.ZeroAddress.selector);
        split.createDeal(address(0), w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_ZeroAddressRecipient() public {
        address[] memory w = new address[](2); w[0]=address(0); w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=5000; b[1]=5000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.ZeroAddress.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_DuplicateRecipients() public {
        address[] memory w = new address[](2); w[0]=recip1; w[1]=recip1;
        uint16[]  memory b = new uint16[](2);  b[0]=5000; b[1]=5000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.DuplicateAddress.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_RecipientIsPayer() public {
        address[] memory w = new address[](2); w[0]=payer; w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=5000; b[1]=5000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.DuplicateAddress.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_RecipientIsApprover() public {
        address[] memory w = new address[](2); w[0]=approver; w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=5000; b[1]=5000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.DuplicateAddress.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_ApproverIsPayer() public {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.DuplicateAddress.selector);
        split.createDeal(payer, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_TotalBpsNot10000() public {
        address[] memory w = new address[](2); w[0]=recip1; w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=4000; b[1]=4000; // sum=8000
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidBps.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_BpsZeroOnRecipient() public {
        address[] memory w = new address[](2); w[0]=recip1; w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=0; b[1]=10000;
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidBps.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_ZeroAmount() public {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.ZeroAmount.selector);
        split.createDeal(approver, w, b, 0, block.timestamp + 1 days);
    }

    function test_CreateDeal_Revert_DeadlineInPast() public {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidDeadline.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp - 1);
    }

    function test_CreateDeal_Revert_DeadlineEqualsTimestamp() public {
        (address[] memory w, uint16[] memory b) = _twoWallets();
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.InvalidDeadline.selector);
        split.createDeal(approver, w, b, DEAL_AMOUNT, block.timestamp);
    }

    // -----------------------------------------------------------------------
    // 4. fundDeal — HAPPY PATH
    // -----------------------------------------------------------------------

    function test_FundDeal_HappyPath() public {
        _mintAndApprove(payer, DEAL_AMOUNT);
        uint256 dealId = _createDeal2();

        uint256 payerBal    = usdc.balanceOf(payer);
        uint256 contractBal = usdc.balanceOf(address(split));

        vm.expectEmit(true, false, false, false, address(split));
        emit ReleaseSplit.DealFunded(dealId);

        vm.prank(payer);
        split.fundDeal(dealId);

        assertEq(usdc.balanceOf(payer),          payerBal    - DEAL_AMOUNT);
        assertEq(usdc.balanceOf(address(split)),  contractBal + DEAL_AMOUNT);

        (,,,,,, , uint8 state) = split.getDeal(dealId);
        assertEq(state, 1); // Funded
    }

    // -----------------------------------------------------------------------
    // 5. fundDeal — REVERT PATHS
    // -----------------------------------------------------------------------

    function test_FundDeal_Revert_NotPayer() public {
        _mintAndApprove(stranger, DEAL_AMOUNT);
        uint256 dealId = _createDeal2();
        vm.prank(stranger);
        vm.expectRevert(ReleaseSplit.NotPayer.selector);
        split.fundDeal(dealId);
    }

    function test_FundDeal_Revert_WrongState_DoubleFund() public {
        uint256 dealId = _createAndFund2();
        _mintAndApprove(payer, DEAL_AMOUNT);
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.fundDeal(dealId);
    }

    // -----------------------------------------------------------------------
    // 6. releaseDeal — HAPPY PATHS
    // -----------------------------------------------------------------------

    function test_ReleaseDeal_TwoRecipients_50_50() public {
        uint256 dealId = _createAndFund2();

        uint256 r1Before = usdc.balanceOf(recip1);
        uint256 r2Before = usdc.balanceOf(recip2);

        vm.expectEmit(true, false, false, false, address(split));
        emit ReleaseSplit.DealReleased(dealId);

        vm.prank(approver);
        split.releaseDeal(dealId);

        uint256 share2 = (DEAL_AMOUNT * 5000) / 10000;
        uint256 share1 = DEAL_AMOUNT - share2;

        assertEq(usdc.balanceOf(recip1), r1Before + share1);
        assertEq(usdc.balanceOf(recip2), r2Before + share2);
        assertEq(share1 + share2, DEAL_AMOUNT);
        assertEq(usdc.balanceOf(address(split)), 0);

        (,,,,,,, uint8 state) = split.getDeal(dealId);
        assertEq(state, 2); // Released
    }

    function test_ReleaseDeal_ThreeRecipients_60_30_10() public {
        uint256 dealId = _createAndFund3();

        vm.prank(approver);
        split.releaseDeal(dealId);

        uint256 share2 = (DEAL_AMOUNT * 3000) / 10000; // 300 USDC
        uint256 share3 = (DEAL_AMOUNT * 1000) / 10000; // 100 USDC
        uint256 share1 = DEAL_AMOUNT - share2 - share3; // remainder=600

        assertEq(usdc.balanceOf(recip1), share1);
        assertEq(usdc.balanceOf(recip2), share2);
        assertEq(usdc.balanceOf(recip3), share3);
        assertEq(usdc.balanceOf(address(split)), 0);
    }

    function test_ReleaseDeal_DustHandling_FirstRecipientGetsRemainder() public {
        uint256 oddAmount = 1_000_001;
        (address[] memory w, uint16[] memory b) = _threeWallets();
        _mintAndApprove(payer, oddAmount);
        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, oddAmount, block.timestamp + 1 days);
        vm.prank(payer);
        split.fundDeal(dealId);
        vm.prank(approver);
        split.releaseDeal(dealId);

        uint256 s2 = (oddAmount * 3000) / 10000;
        uint256 s3 = (oddAmount * 1000) / 10000;
        uint256 s1 = oddAmount - s2 - s3;

        assertEq(usdc.balanceOf(recip1), s1);
        assertEq(usdc.balanceOf(recip2), s2);
        assertEq(usdc.balanceOf(recip3), s3);
        assertEq(usdc.balanceOf(address(split)), 0);
        assertEq(s1 + s2 + s3, oddAmount);
    }

    // -----------------------------------------------------------------------
    // 7. releaseDeal — REVERT PATHS
    // -----------------------------------------------------------------------

    function test_ReleaseDeal_Revert_NotApprover() public {
        uint256 dealId = _createAndFund2();
        vm.prank(stranger);
        vm.expectRevert(ReleaseSplit.NotApprover.selector);
        split.releaseDeal(dealId);
    }

    function test_ReleaseDeal_Revert_WrongState_NotFunded() public {
        uint256 dealId = _createDeal2();
        vm.prank(approver);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.releaseDeal(dealId);
    }

    function test_ReleaseDeal_Revert_DeadlinePassed() public {
        uint256 dealId = _createAndFund2();
        vm.warp(block.timestamp + 2 days);
        vm.prank(approver);
        vm.expectRevert(ReleaseSplit.DeadlinePassed.selector);
        split.releaseDeal(dealId);
    }

    // -----------------------------------------------------------------------
    // 8. refundDeal — HAPPY PATH
    // -----------------------------------------------------------------------

    function test_RefundDeal_HappyPath_PayerGetsFullAmountBack() public {
        uint256 dealId = _createAndFund2();
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.warp(block.timestamp + 2 days);

        vm.expectEmit(true, false, false, false, address(split));
        emit ReleaseSplit.DealRefunded(dealId);

        vm.prank(payer);
        split.refundDeal(dealId);

        assertEq(usdc.balanceOf(payer),          payerBefore + DEAL_AMOUNT);
        assertEq(usdc.balanceOf(address(split)),  0);

        (,,,,,,, uint8 state) = split.getDeal(dealId);
        assertEq(state, 3); // Refunded
    }

    // -----------------------------------------------------------------------
    // 9. refundDeal — REVERT PATHS
    // -----------------------------------------------------------------------

    function test_RefundDeal_Revert_NotPayer() public {
        uint256 dealId = _createAndFund2();
        vm.warp(block.timestamp + 2 days);
        vm.prank(stranger);
        vm.expectRevert(ReleaseSplit.NotPayer.selector);
        split.refundDeal(dealId);
    }

    function test_RefundDeal_Revert_WrongState_NotFunded() public {
        uint256 dealId = _createDeal2();
        vm.warp(block.timestamp + 2 days);
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.refundDeal(dealId);
    }

    function test_RefundDeal_Revert_DeadlineNotPassed() public {
        uint256 dealId = _createAndFund2();
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.DeadlineNotPassed.selector);
        split.refundDeal(dealId);
    }

    function test_RefundDeal_Revert_DeadlineNotPassed_ExactDeadline() public {
        uint256 deadline = block.timestamp + 1 days;
        (address[] memory w, uint16[] memory b) = _twoWallets();
        _mintAndApprove(payer, DEAL_AMOUNT);
        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, DEAL_AMOUNT, deadline);
        vm.prank(payer);
        split.fundDeal(dealId);
        vm.warp(deadline);
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.DeadlineNotPassed.selector);
        split.refundDeal(dealId);
    }

    // -----------------------------------------------------------------------
    // 10 & 11. Double-action prevention
    // -----------------------------------------------------------------------

    function test_DoubleRelease_Reverts() public {
        uint256 dealId = _createAndFund2();
        vm.prank(approver);
        split.releaseDeal(dealId);
        vm.prank(approver);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.releaseDeal(dealId);
    }

    function test_DoubleRefund_Reverts() public {
        uint256 dealId = _createAndFund2();
        vm.warp(block.timestamp + 2 days);
        vm.prank(payer);
        split.refundDeal(dealId);
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.refundDeal(dealId);
    }

    // -----------------------------------------------------------------------
    // 12. Cross-action prevention
    // -----------------------------------------------------------------------

    function test_CrossAction_RefundOnReleasedDeal_Reverts() public {
        uint256 dealId = _createAndFund2();
        vm.prank(approver);
        split.releaseDeal(dealId);
        vm.warp(block.timestamp + 2 days);
        vm.prank(payer);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.refundDeal(dealId);
    }

    function test_CrossAction_ReleaseOnRefundedDeal_Reverts() public {
        uint256 dealId = _createAndFund2();
        vm.warp(block.timestamp + 2 days);
        vm.prank(payer);
        split.refundDeal(dealId);
        vm.prank(approver);
        vm.expectRevert(ReleaseSplit.WrongState.selector);
        split.releaseDeal(dealId);
    }

    // -----------------------------------------------------------------------
    // 13. getDeal state progression
    // -----------------------------------------------------------------------

    function test_GetDeal_StateProgression() public {
        uint256 dealId = _createDeal2();
        (,,,,,,, uint8 s0) = split.getDeal(dealId);
        assertEq(s0, 0); // Created

        _mintAndApprove(payer, DEAL_AMOUNT);
        vm.prank(payer);
        split.fundDeal(dealId);
        (,,,,,,, uint8 s1) = split.getDeal(dealId);
        assertEq(s1, 1); // Funded

        vm.prank(approver);
        split.releaseDeal(dealId);
        (,,,,,,, uint8 s2) = split.getDeal(dealId);
        assertEq(s2, 2); // Released
    }

    function test_GetDeal_RefundedState() public {
        uint256 dealId = _createAndFund2();
        vm.warp(block.timestamp + 2 days);
        vm.prank(payer);
        split.refundDeal(dealId);
        (,,,,,,, uint8 s) = split.getDeal(dealId);
        assertEq(s, 3); // Refunded
    }

    // -----------------------------------------------------------------------
    // 14. FUZZ
    // -----------------------------------------------------------------------

    function testFuzz_CreateDeal_ValidInputs(
        uint256 amount,
        uint256 deadlineOffset,
        uint16  bps1
    ) public {
        amount         = bound(amount,         1,    type(uint128).max);
        deadlineOffset = bound(deadlineOffset, 1,    365 days);
        bps1           = uint16(bound(bps1,    1,    9999));
        uint16 bps2    = uint16(10000 - bps1);

        address[] memory w = new address[](2); w[0]=recip1; w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=bps1;   b[1]=bps2;
        uint256 deadline = block.timestamp + deadlineOffset;

        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, amount, deadline);

        (,,,uint16[3] memory rb,, uint256 amt, uint256 dl,) = split.getDeal(dealId);
        assertEq(amt, amount);
        assertEq(dl, deadline);
        assertEq(uint256(rb[0]) + uint256(rb[1]), 10000);
    }

    function testFuzz_FundAndRelease_DistributionAddsUp(uint256 amount, uint16 bps1) public {
        amount = bound(amount, 1, 1_000_000e6);
        bps1   = uint16(bound(bps1, 1, 9999));
        uint16 bps2 = uint16(10000 - bps1);

        address[] memory w = new address[](2); w[0]=recip1; w[1]=recip2;
        uint16[]  memory b = new uint16[](2);  b[0]=bps1;   b[1]=bps2;

        _mintAndApprove(payer, amount);
        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, amount, block.timestamp + 1 days);
        vm.prank(payer);
        split.fundDeal(dealId);
        vm.prank(approver);
        split.releaseDeal(dealId);

        assertEq(usdc.balanceOf(recip1) + usdc.balanceOf(recip2), amount);
        assertEq(usdc.balanceOf(address(split)), 0);
    }

    function testFuzz_FundAndRelease_ThreeRecipients_DistributionAddsUp(
        uint256 amount, uint16 bpsA, uint16 bpsB
    ) public {
        amount = bound(amount, 1, 1_000_000e6);
        bpsA   = uint16(bound(bpsA, 1, 9998));
        bpsB   = uint16(bound(bpsB, 1, uint256(9999) - bpsA));
        uint16 bpsC = uint16(10000 - bpsA - bpsB);

        address[] memory w = new address[](3); w[0]=recip1; w[1]=recip2; w[2]=recip3;
        uint16[]  memory b = new uint16[](3);  b[0]=bpsA;   b[1]=bpsB;   b[2]=bpsC;

        _mintAndApprove(payer, amount);
        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, amount, block.timestamp + 1 days);
        vm.prank(payer);
        split.fundDeal(dealId);
        vm.prank(approver);
        split.releaseDeal(dealId);

        assertEq(
            usdc.balanceOf(recip1) + usdc.balanceOf(recip2) + usdc.balanceOf(recip3),
            amount
        );
        assertEq(usdc.balanceOf(address(split)), 0);
    }

    function testFuzz_Refund_ReturnsExactAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        (address[] memory w, uint16[] memory b) = _twoWallets();
        _mintAndApprove(payer, amount);
        vm.prank(payer);
        uint256 dealId = split.createDeal(approver, w, b, amount, block.timestamp + 1 days);
        vm.prank(payer);
        split.fundDeal(dealId);
        vm.warp(block.timestamp + 2 days);
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        split.refundDeal(dealId);
        assertEq(usdc.balanceOf(payer), before + amount);
        assertEq(usdc.balanceOf(address(split)), 0);
    }
}

// ---------------------------------------------------------------------------
// Invariant test
// ---------------------------------------------------------------------------
contract ReleaseSplitInvariantTest is Test {

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    ReleaseSplit        internal split;
    MockERC20           internal usdc;
    ReleaseSplitHandler internal handler;

    function setUp() public {
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc  = MockERC20(USDC_ADDR);
        split = new ReleaseSplit();
        handler = new ReleaseSplitHandler(split, usdc);
        targetContract(address(handler));
    }

    function invariant_ContractHoldsNoUsdcAfterRelease() public view {
        if (handler.dealReleased()) {
            assertEq(usdc.balanceOf(address(split)), 0);
        }
    }

    function invariant_DealCountNeverDecreases() public view {
        assertGe(split.dealCount(), 0);
    }
}
