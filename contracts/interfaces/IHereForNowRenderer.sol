// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IHereForNowRenderer
/// @notice Interface for the HereForNow renderer contract
interface IHereForNowRenderer {
    /// @notice Generates the token URI for the artwork
    /// @param activeParticipants Number of addresses with non-zero balance
    /// @return The complete data URI with JSON metadata and base64-encoded SVG
    function tokenURI(
        uint256 activeParticipants
    ) external view returns (string memory);

    /// @notice Generates just the SVG for the artwork
    /// @param activeParticipants Number of addresses with non-zero balance
    /// @return The raw SVG string
    function generateSVG(
        uint256 activeParticipants
    ) external view returns (string memory);

    /// @notice Returns the artwork name
    function name() external view returns (string memory);

    /// @notice Returns the artwork description
    function description() external view returns (string memory);

    /// @notice Returns the author
    function author() external view returns (string memory);

    /// @notice Returns the URLs
    function urls() external view returns (string[] memory);
}
