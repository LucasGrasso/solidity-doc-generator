// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice This is a free function
/// @dev It does nothing
/// @param a This is a parameter
/// @return b This is a return value
function alpha(uint a) pure returns (uint b) {
    b = a + 1;
}

/// @notice This is a struct
/// @dev It has two properties
struct S {
    /// @custom:property This is a struct property
    uint a;
    /// @custom:property This is a struct property
    string b;
}

/// @notice This is an enum
/// @dev It has three variants
enum E {
    /// @custom:variant This is an enum variant
    A,
    /// @custom:variant This is an enum variant
    B,
    /// @custom:variant This is an enum variant
    C
}

contract A {
    struct SA {
        uint a;
        string b;
    }

    function foo(uint a) public {}
}

contract B {
    enum EB {
        A,
        B,
        C
    }

    function bar() public {}
}
