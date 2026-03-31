// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {I as J, E, k} from "./I.sol";

contract C is J, k.K {
    /// @inheritdoc J
    function foo() external override {}

    /// @inheritdoc k.K
    function bar() external override {}
}
