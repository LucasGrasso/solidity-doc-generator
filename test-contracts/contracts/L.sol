// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

function zero() pure returns (uint) {
    return 0;
}

struct US {
    uint a;
    string b;
}

library L {
    function plusOne(uint x) external pure returns (uint) {
        return x + 1;
    }
}

contract M {
    using L for uint;

    function foo() external pure returns (uint) {
        uint a = 5;
        return a.plusOne();
    }
}
