const { expect } = require("chai");

/*
  * TEST SUMMARY
  * deploy vesting contract
  * send tokens to vesting contract (100 tokens)
  * create new vesting schedule (100 tokens)
  * check that vested amount is 0
  * set time to half the vesting period
  * check that vested amount is half the total amount to vest (50 tokens)
  * check that only beneficiary can try to release vested tokens
  * check that beneficiary cannot release more than the vested amount
  * release 10 tokens and check that a Transfer event is emitted with a value of 10
  * check that the released amount is 10
  * check that the vested amount is now 40
  * set current time after the end of the vesting period
  * check that the vested amount is 90 (100 - 10 released tokens)
  * release all vested tokens (90)
  * check that the number of released tokens is 100
  * check that the vested amount is 0
  */

describe("TokenVesting", function () {
  let Token;
  let testToken;
  let TokenVesting;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  before(async function () {
    Token = await ethers.getContractFactory("Token");
    TokenVesting = await ethers.getContractFactory("MockTokenVesting");
  });

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    testToken = await Token.deploy("Test Token", "TT", 1000000);
    await testToken.deployed();
  });

  describe("Vesting", function () {
    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await testToken.balanceOf(owner.address);
      expect(await testToken.totalSupply()).to.equal(ownerBalance);
    });

    it("Should vest tokens gradually", async function () {
      // deploy vesting contract
      const tokenVesting = await TokenVesting.deploy(testToken.address);
      await tokenVesting.deployed();
      expect((await tokenVesting.getToken()).toString()).to.equal(
        testToken.address
      );

      // send tokens to vesting contract
      await expect(testToken.transfer(tokenVesting.address, 100))
        .to.emit(testToken, "Transfer")
        .withArgs(owner.address, tokenVesting.address, 100);
      const vestingContractBalance = await testToken.balanceOf(
        tokenVesting.address
      );
      expect(vestingContractBalance).to.equal(100);

      const baseTime = 1638102492;
      const beneficiary = addr1;
      const startTime = baseTime;
      const cliff = 2592000; // 30 days
      const duration = 10368000; // 120 days
      const slicePeriodSeconds = 2592000; // 30 days
      const amount = 100;

      // create new vesting schedule
      await tokenVesting.createVestingSchedule(
        beneficiary.address,
        startTime,
        cliff,
        duration,
        slicePeriodSeconds,
        amount
      );

      // check that vested amount is 0
      expect(await tokenVesting.computeReleasableAmount()).to.be.equal(0);

      // set time to 1st eligible vesting period (25% time)
      const quarterDuration = duration / 4;
      const quarterTime = baseTime + quarterDuration;
      await tokenVesting.setCurrentTime(quarterTime);

      // check that vested amount is 25% the total amount to vest
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(25);

      // check that only beneficiary can try to release vested tokens
      await expect(tokenVesting.connect(addr2).release(100)).to.be.revertedWith(
        "TokenVesting: only beneficiary and owner can release vested tokens"
      );

      // check that beneficiary cannot release more than the vested amount
      await expect(
        tokenVesting.connect(beneficiary).release(26)
      ).to.be.revertedWith(
        "TokenVesting: cannot release tokens, not enough vested tokens"
      );

      // release 10 tokens and check that a Transfer event is emitted with a value of 10
      await expect(tokenVesting.connect(beneficiary).release(10))
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVesting.address, beneficiary.address, 10);

      // check that the vested amount is now 15
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(15);
      let vestingSchedule = await tokenVesting.vestingSchedule();

      // check that the released amount is 10
      expect(vestingSchedule.released).to.be.equal(10);

      // release 15 tokens and check that a Transfer event is emitted with a value of 15
      await expect(tokenVesting.connect(beneficiary).release(15))
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVesting.address, beneficiary.address, 15);
      vestingSchedule = await tokenVesting.vestingSchedule();

      // check that releasable amount is now 0
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(0);

      // check that the vested amount is 25
      expect(vestingSchedule.released).to.be.equal(25);

      // wait a bit (! day) but not enough until 2nd vesting period
      await tokenVesting.setCurrentTime(quarterTime + 86400);

      // check that releasable amount is now 0
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(0);

      // set current time at 2nd vesting period (50% time)
      const halfTime = baseTime + quarterDuration * 2;
      await tokenVesting.setCurrentTime(halfTime);

      // check that releasable amount is now 25
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(25);

      // release 25 tokens and check that a Transfer event is emitted with a value of 25
      await expect(tokenVesting.connect(beneficiary).release(25))
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVesting.address, beneficiary.address, 25);
      vestingSchedule = await tokenVesting.vestingSchedule();

      // check that releasable amount is now 0
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(0);

      // check that the vested amount is 50
      expect(vestingSchedule.released).to.be.equal(50);

      // wait a bit (! day) but not enough until 3nd vesting period
      await tokenVesting.setCurrentTime(halfTime + 86400);

      // set current time at 3rd vesting period (75% time)
      const threeQuartersTime = baseTime + quarterDuration * 3;
      await tokenVesting.setCurrentTime(threeQuartersTime);

      // check that releasable amount is now 25
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(25);

      // release 25 tokens and check that a Transfer event is emitted with a value of 25
      await expect(tokenVesting.connect(beneficiary).release(25))
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVesting.address, beneficiary.address, 25);
      vestingSchedule = await tokenVesting.vestingSchedule();

      // check that releasable amount is now 0
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(0);

      // check that the vested amount is 75
      expect(vestingSchedule.released).to.be.equal(75);

      // set current time at 4th vesting period (100% time)
      const fullTime = baseTime + quarterDuration * 4;
      await tokenVesting.setCurrentTime(fullTime);

      // check that releasable amount is now 25
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(25);

      // release 25 tokens and check that a Transfer event is emitted with a value of 25
      await expect(tokenVesting.connect(beneficiary).release(25))
        .to.emit(testToken, "Transfer")
        .withArgs(tokenVesting.address, beneficiary.address, 25);
      vestingSchedule = await tokenVesting.vestingSchedule();

      // check that the number of released tokens is 100
      expect(vestingSchedule.released).to.be.equal(100);

      // check that the releasable amount is 0
      expect(
        await tokenVesting.connect(beneficiary).computeReleasableAmount()
      ).to.be.equal(0);
    });

    it("Should check input parameters for createVestingSchedule method", async function () {
      const tokenVesting = await TokenVesting.deploy(testToken.address);
      await tokenVesting.deployed();
      await testToken.transfer(tokenVesting.address, 1000);
      const time = Date.now();
      await expect(
        tokenVesting.createVestingSchedule(
          addr1.address,
          time,
          0,
          0,
          1,
          1
        )
      ).to.be.revertedWith("TokenVesting: duration must be > 0");
      await expect(
        tokenVesting.createVestingSchedule(
          addr1.address,
          time,
          0,
          1,
          0,
          1
        )
      ).to.be.revertedWith("TokenVesting: slicePeriodSeconds must be >= 1");
      await expect(
        tokenVesting.createVestingSchedule(
          addr1.address,
          time,
          0,
          1,
          1,
          0
        )
      ).to.be.revertedWith("TokenVesting: amount must be > 0");
    });
  });
});
