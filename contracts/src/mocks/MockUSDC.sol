// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice CHỈ DÙNG CHO LOCAL VÀ FUJI. Đóng vai USDC (6 số thập phân), ai cũng mint được.
///         Có EIP-2612 `permit` giống USDC thật: người dùng ký cho phép trừ tiền, relayer gửi giao dịch hộ.
///         Script deploy từ chối triển khai contract này lên mainnet.
contract MockUSDC is ERC20, ERC20Permit {
    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
