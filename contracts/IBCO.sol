//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "contracts/SEuro.sol";

contract IBCO is Ownable {
    address private seuro;

    event Swap();
    event TokenLog(uint hello);

    mapping(bytes32 => Token) tokens;
    // Token[] tokens;

    struct Token {
        address addr;

    }

    constructor(address _seuro) {
        seuro = _seuro;
        addAcceptedTokens();
    }

    function addAcceptedTokens() private {
        tokens[bytes32("WETH")] = Token(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    }

    function swap(bytes32 _token, uint256 _amount) public returns (bool) {
        Token memory token = tokens[_token];
        IERC20 tokenContract = IERC20(token.addr);
        tokenContract.transferFrom(msg.sender, address(this), _amount);
        SEuro(seuro).mint(msg.sender, 2800);
        // check given token
        // transferFrom(msg.sender, _amount)
        // chainlink:
        //   get dollar price for token
        //   get eur price for dollar
        // apply token & discount rate
        // mint euros to msg.sender
        // emit swap event
    }

    function swapETH() external payable {
        // convert given eth to weth
        // call swap()
    }

    // function getAcceptedTokens() public view returns (Token[] memory acceptedTokens) {
    //     // show all the tokens
    // }

    function addAcceptedToken(address _token, bytes32 _name) public onlyOwner {
        // blah
    }

    function removeAcceptedToken(bytes32 _name) public onlyOwner {
        // blah
    }

    function chainlink(address _token) private returns (uint256 rate) {
        // get dollar price for token
        // get eur price for dollar
    }

    function currentDiscount() public returns (uint256 discountRate) {
        // get the current seuro discount based on curve
        // is it time ?! is it volume ?! watch this space
    }
}