const hre = require("hardhat");

async function main() {
    // We get the contract to deploy
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(["0x18b8Aae97Dfa416EF9F933562d6F8070dA1E3141", "0xBa8d9AcE4742D23025dB76f7483C568cdEB66B39"], [1000, 3000]);
    await token.mint("0x65d0ADD53823F4c49734621e01001825a7ac3F63", 1000);
    console.log("Token deployed to:", token.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
