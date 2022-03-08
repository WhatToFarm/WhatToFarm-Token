const { assert, expect } = require("chai");
const { ethers, waffle } = require("hardhat");

describe("WhatToFarm token", async function () {
   let owner, user1, user2, user3, user4, addrPool;

   beforeEach("Deploy the contract", async function () {
      [owner, user1, user2, user3, user4, addrPool] = await ethers.getSigners();
      Token = await ethers.getContractFactory("Token");
      token = await Token.deploy([user1.address, user2.address], [10000, 30000]);
      await token.deployed();
   });
   
   describe("The correct deployment", async function () {
      it("Users isTeam", async function () {
         const teamToken1 = await token.teamUsers(user1.address);
         await expect(teamToken1[0]).to.equal(true);
         await expect(teamToken1[1]).to.equal(0);

         const teamToken2 = await token.teamUsers(user2.address);
         await expect(teamToken2[0]).to.equal(true);
         await expect(teamToken2[1]).to.equal(0);
      });
      
      it("Start time is correct", async function () {
         const blockNumNow = await ethers.provider.getBlockNumber();
         const blockNow = await ethers.provider.getBlock(blockNumNow);
         const timestampNow = blockNow.timestamp;
         await expect(await token.beginning()).to.equal(timestampNow);
      });
      
      it("pancakeV2Router is correct", async function () {
         await expect(await token.pancakeV2Router()).to.equal("0xD99D1c33F9fC3444f8101754aBC46c52416550D1");
      });
      
      it("_isExcludedFromFee is correct", async function () {
         await expect(await token.isExcludedFromFee(owner.address)).to.equal(true);
         await expect(await token.isExcludedFromFee(token.address)).to.equal(true);
      });
   });

   describe("Set pool", async function () {
      it("Not owner sets pool", async function () {
         await expect(token.connect(user1).setPool(addrPool.address)).to.be.reverted;
      });

      it("0x0", async function () {
         await expect(token.setPool(ethers.constants.AddressZero)).to.be.reverted;
      });

      it("Owner sets pool", async function () {
         await token.setPool(addrPool.address);
         await expect(await token.poolPancake()).to.equal(addrPool.address);
      });
   });

   describe("Name", async function () {
      it("The correct", async function () {
         await expect(await token.name()).to.equal("WhatToFarm");
      });
   });

   describe("Symbol", async function () {
      it("The correct", async function () {
         await expect(await token.symbol()).to.equal("WTF");
      });
   });

   describe("Decimals", async function () {
      it("The correct", async function () {
         await expect(await token.decimals()).to.equal(18);
      });
   });

   describe("Total Supply", async function () {
      it("The correct", async function () {
         await expect(await token.totalSupply()).to.equal(40000);
      });
   });

   describe("SetWalletLockup", async function () {
      it("Not owner", async function () {
         await expect(token.connect(user1).setWalletLockup(user2.address, [3600, 7200, 14400], [20, 30, 50])).to.be.reverted;
      });

      it("Not teamUsers", async function () {
         await expect(token.setWalletLockup(user3.address, [3600, 7200, 14400], [20, 30, 50])).to.be.reverted;
      });

      it("Wrong rates", async function () {
         await expect(token.setWalletLockup(user1.address, [3600, 7200, 14400], [20, 30, 51])).to.be.reverted;
      });

      it("Owner", async function () {
         await token.setWalletLockup(user1.address, [3600, 7200, 14400], [20, 30, 50]);
         const walletLockups = await token.walletLockups(user1.address);
         await expect(walletLockups[0]).to.equal(3600);
         await expect(walletLockups[1]).to.equal(20);
         await expect(walletLockups[2]).to.equal(7200);
         await expect(walletLockups[3]).to.equal(30);
         await expect(walletLockups[4]).to.equal(14400);
         await expect(walletLockups[5]).to.equal(50);
      });
   });

   describe("Transfer", async function () {
      beforeEach("setWalletLockup", async function () {
         await token.setWalletLockup(user1.address, [3600, 7200, 14400], [20, 30, 50]);
         await token.setWalletLockup(user2.address, [1000, 2000, 3000], [10, 40, 50]);
         await token.setSwapAndLiquifyEnabled(false);
      });

      it("Insufficient balance", async function () {
         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).transfer(user3.address, 1000);
         await expect(await token.balanceOf(user3.address)).to.equal(900);
         await expect(token.connect(user3).transfer(user4.address, 2000)).to.be.reverted;
      });

      it("Wrong address", async function () {
         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).transfer(user3.address, 1000);
         await expect(token.connect(user3).transfer(ethers.constants.AddressZero, 900)).to.be.reverted;
      });

      it("Exceeded balance", async function () {
         await network.provider.send("evm_increaseTime", [1000]);
         await expect(token.connect(user1).transfer(user4.address, 1000)).to.be.reverted;
      });

      it("transfer", async function () {
         await expect(await token.balanceOf(token.address)).to.equal(0);
         await expect(await token.balanceOf(user1.address)).to.equal(10000);
         await expect(await token.balanceOf(user4.address)).to.equal(0);
         await expect(await token.totalFees()).to.equal(0);

         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).transfer(user4.address, 1000);

         await expect(await token.isExcludedFromFee(user1.address)).to.equal(false);
         await expect(await token.isExcludedFromFee(user3.address)).to.equal(false);
         await expect(await token.isExcludedFromFee(user4.address)).to.equal(false);

         await expect(await token.balanceOf(user1.address)).to.equal(9000);
         await expect(await token.balanceOf(user4.address)).to.equal(900);
         await expect(await token.balanceOf(token.address)).to.equal(50);
         await expect(await token.totalFees()).to.equal(50);

         await expect(token.connect(user1).transfer(user4.address, 1001)).to.be.reverted;

         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).transfer(user3.address, 4000);

         await expect(await token.balanceOf(user1.address)).to.equal(5000);
         await expect(await token.balanceOf(user3.address)).to.equal(3600);
         await expect(await token.balanceOf(token.address)).to.equal(250);
         await expect(await token.totalFees()).to.equal(250);

         await network.provider.send("evm_increaseTime", [7200]);
         await token.connect(user1).transfer(user3.address, 5000);

         await expect(await token.balanceOf(user1.address)).to.equal(0);
         await expect(await token.balanceOf(user3.address)).to.equal(8100);
         await expect(await token.balanceOf(token.address)).to.equal(500);
         await expect(await token.totalFees()).to.equal(500);

         await token.connect(user3).transfer(user4.address, 500);

         await expect(await token.balanceOf(user3.address)).to.equal(7600);
         await expect(await token.balanceOf(user4.address)).to.equal(1350);
         await expect(await token.balanceOf(token.address)).to.equal(525);
         await expect(await token.totalFees()).to.equal(525);
      });
   });

   describe("TransferFrom", async function () {
      beforeEach("setWalletLockup", async function () {
         await token.setWalletLockup(user1.address, [3600, 7200, 14400], [20, 30, 50]);
         await token.setWalletLockup(user2.address, [1000, 2000, 3000], [10, 40, 50]);
         await token.setSwapAndLiquifyEnabled(false);
      });

      it("Insufficient balance", async function () {
         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).transfer(user3.address, 1000);
         await expect(await token.balanceOf(user3.address)).to.equal(900);
         await expect(token.connect(user3).transferFrom(user4.address, 2000)).to.be.reverted;
      });

      it("Exceeded balance", async function () {
         await network.provider.send("evm_increaseTime", [1000]);
         await expect(token.connect(user1).transferFrom(user3.address, 1000)).to.be.reverted;
      });

      it("ERC20: transfer amount exceeds allowance", async function () {
         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).approve(user3.address, 1000);
         await expect(token.connect(user3).transferFrom(user1.address, user4.address, 1001)).to.be.reverted;
      });

      it("transferFrom", async function () {
         await expect(await token.balanceOf(token.address)).to.equal(0);
         await expect(await token.totalFees()).to.equal(0);
         await expect(await token.balanceOf(user1.address)).to.equal(10000);
         await expect(await token.balanceOf(user3.address)).to.equal(0);

         await network.provider.send("evm_increaseTime", [3600]);
         await token.connect(user1).approve(user3.address, 1000);
         await token.connect(user3).transferFrom(user1.address, user4.address, 1000);

         await expect(await token.balanceOf(token.address)).to.equal(50);
         await expect(await token.totalFees()).to.equal(50);
         await expect(await token.balanceOf(user1.address)).to.equal(9000);
         await expect(await token.balanceOf(user3.address)).to.equal(0);
         await expect(await token.balanceOf(user4.address)).to.equal(900);

         await token.connect(user1).transfer(user3.address, 1000);

         await expect(await token.balanceOf(token.address)).to.equal(100);
         await expect(await token.totalFees()).to.equal(100);
         await expect(await token.balanceOf(user1.address)).to.equal(8000);
         await expect(await token.balanceOf(user3.address)).to.equal(900);
         await expect(await token.balanceOf(user4.address)).to.equal(900);

         await token.connect(user3).approve(user1.address, 1000);
         await token.connect(user1).transferFrom(user3.address, user4.address, 500);

         await expect(await token.balanceOf(token.address)).to.equal(125);
         await expect(await token.totalFees()).to.equal(125);
         await expect(await token.balanceOf(user1.address)).to.equal(8000);
         await expect(await token.balanceOf(user3.address)).to.equal(400);
         await expect(await token.balanceOf(user4.address)).to.equal(1350);
      });
   });

   describe("Mint/Burn", async function () {
      it("mint", async function () {
         await expect(await token.balanceOf(user3.address)).to.equal(0);
         await expect(await token.totalSupply()).to.equal(40000);
         await token.mint(user3.address, 1000);
         await expect(await token.balanceOf(user3.address)).to.equal(1000);
         await expect(await token.totalSupply()).to.equal(41000);
      });

      it("burn", async function () {
         await expect(await token.balanceOf(user3.address)).to.equal(0);
         await expect(await token.totalSupply()).to.equal(40000);
         await token.mint(user3.address, 1000);
         await token.connect(user3).burn(1000);
         await expect(await token.balanceOf(user3.address)).to.equal(0);
         await expect(await token.totalSupply()).to.equal(40000);
      });
   });

   describe("ExcludeFromFee/IncludeFromFee", async function () {
      beforeEach("Mint tokens to user3, user4", async function () {
         await token.setSwapAndLiquifyEnabled(false);
         await token.mint(user3.address, 5000);
         await token.mint(user4.address, 10000);
      });

      it("Not owner", async function () {
         await expect(token.connect(user1).excludeFromFee(user3.address)).to.be.reverted;
         await token.excludeFromFee(user3.address);
         await expect(token.connect(user1).includeInFee(user3.address)).to.be.reverted;
      });

      it("ExcludeFromFee", async function () {
         await expect(await token.isExcludedFromFee(user1.address)).to.equal(false);
         await expect(await token.isExcludedFromFee(user3.address)).to.equal(false);
         await expect(await token.isExcludedFromFee(user4.address)).to.equal(false);

         await expect(await token.balanceOf(token.address)).to.equal(0);
         await expect(await token.totalFees()).to.equal(0);

         await token.excludeFromFee(user3.address);
         await expect(await token.isExcludedFromFee(user3.address)).to.equal(true);
         await token.connect(user3).transfer(user4.address, 1000);

         await expect(await token.balanceOf(token.address)).to.equal(0);
         await expect(await token.totalFees()).to.equal(0);

         await token.connect(user4).transfer(user3.address, 1000);
         await expect(await token.balanceOf(token.address)).to.equal(0);
         await expect(await token.totalFees()).to.equal(0);

         await token.connect(user4).transfer(user1.address, 1000);
         await expect(await token.balanceOf(token.address)).to.equal(50);
         await expect(await token.totalFees()).to.equal(50);
      });

      it("IncludeFromFee", async function () {
         await expect(await token.isExcludedFromFee(user3.address)).to.equal(false);
         await expect(await token.isExcludedFromFee(user4.address)).to.equal(false);

         await token.excludeFromFee(user3.address);
         await expect(await token.isExcludedFromFee(user3.address)).to.equal(true);
         await token.connect(user3).transfer(user4.address, 1000);

         await expect(await token.balanceOf(token.address)).to.equal(0);
         await expect(await token.totalFees()).to.equal(0);

         await token.includeInFee(user3.address);
         await expect(await token.isExcludedFromFee(user3.address)).to.equal(false);

         await token.connect(user3).transfer(user4.address, 1000);
         await expect(await token.balanceOf(token.address)).to.equal(50);
         await expect(await token.totalFees()).to.equal(50);
      });
   });

   describe("Set fee percent", async function () {
      it("Not owner", async function () {
         await expect(token.connect(user1).setTaxFeePercent(10)).to.be.reverted;
         await expect(token.connect(user1).setLiquidityFeePercent(10)).to.be.reverted;
      });

      it("Set fee percent", async function () {
         await token.setSwapAndLiquifyEnabled(false);
         await token.setTaxFeePercent(10);
         await token.setLiquidityFeePercent(10);

         await expect(await token._taxFee()).to.equal(10);
         await expect(await token._liquidityFee()).to.equal(10);

         await token.mint(user3.address, 1000);

         await token.connect(user3).transfer(user4.address, 1000);
         await expect(await token.balanceOf(token.address)).to.equal(100);
         await expect(await token.totalFees()).to.equal(100);
         await expect(await token.balanceOf(user3.address)).to.equal(0);
         await expect(await token.balanceOf(user4.address)).to.equal(800);
      });
   });

   describe("setSwapAndLiquifyEnabled", async function () {
      it("Not owner", async function () {
         await expect(token.connect(user1).setSwapAndLiquifyEnabled(false)).to.be.reverted;
      });

      it("setSwapAndLiquifyEnabled", async function () {
         await expect(await token.swapAndLiquifyEnabled()).to.equal(true);
         await token.setSwapAndLiquifyEnabled(false);
         await expect(await token.swapAndLiquifyEnabled()).to.equal(false);
      });
   });
});
