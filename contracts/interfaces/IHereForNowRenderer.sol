// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IHereForNowRenderer
/// @notice Interface for the HereForNow renderer contract
interface IHereForNowRenderer {
    /// @notice Generates the token URI for the artwork
    /// @param activeDepositors Number of addresses with non-zero balance
    /// @param totalBalance Total ETH held in the extension contract
    /// @return The complete data URI with JSON metadata and base64-encoded SVG
    function tokenURI(
        uint256 activeDepositors,
        uint256 totalBalance
    ) external view returns (string memory);

    /// @notice Generates just the SVG for the artwork
    /// @param activeDepositors Number of addresses with non-zero balance
    /// @return The raw SVG string
    function generateSVG(
        uint256 activeDepositors
    ) external pure returns (string memory);
}
