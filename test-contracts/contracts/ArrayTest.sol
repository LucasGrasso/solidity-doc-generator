// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Array handling test
contract ArrayTest {
    /// @notice Encodes an array of uint32 values
    /// @dev Takes a uint32 array and returns encoded bytes
    function encode(
        uint32[] calldata arr
    ) external pure returns (bytes memory) {
        return abi.encode(arr);
    }

    /// @notice Decodes bytes into a uint32 array
    /// @dev Decodes an encoded bytes array back to uint32[]
    function decode(
        bytes calldata encoded
    ) external pure returns (uint32[] memory) {
        return abi.decode(encoded, (uint32[]));
    }

    /// @notice Processes nested arrays
    /// @dev Handles uint32[][] nested array structure
    function processNested(
        uint32[][] calldata nested
    ) external pure returns (uint256) {
        return nested.length;
    }

    /// @notice Works with address arrays
    /// @dev Takes an address[] and returns the first address
    function getAddresses(
        address[] calldata addrs
    ) external pure returns (address) {
        return addrs.length > 0 ? addrs[0] : address(0);
    }
}
