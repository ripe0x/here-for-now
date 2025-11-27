// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@manifoldxyz/creator-core-solidity/contracts/core/IERC721CreatorCore.sol";
import "@manifoldxyz/creator-core-solidity/contracts/extensions/ICreatorExtensionTokenURI.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

/// @title MockERC721CreatorCore
/// @notice A minimal mock of Manifold's ERC721CreatorCore for testing
/// @dev Only implements the functions needed for HereForNow extension testing
contract MockERC721CreatorCore is ERC721, Ownable {
    using ERC165Checker for address;

    uint256 private _tokenCount;
    mapping(address => bool) private _extensions;
    mapping(uint256 => address) private _tokenExtensions;

    constructor() ERC721("Mock Creator", "MOCK") {
        // Mint token ID 1 to simulate existing token
        _tokenCount = 1;
        _mint(msg.sender, 1);
    }

    /// @notice Register an extension
    function registerExtension(address extension, string calldata) external onlyOwner {
        _extensions[extension] = true;
    }

    /// @notice Check if address is a registered extension
    function isExtension(address extension) external view returns (bool) {
        return _extensions[extension];
    }

    /// @notice Mint a token via an extension
    function mintExtension(address to) external returns (uint256) {
        require(_extensions[msg.sender], "Must be registered extension");
        _tokenCount++;
        uint256 newTokenId = _tokenCount;
        _mint(to, newTokenId);
        _tokenExtensions[newTokenId] = msg.sender;
        return newTokenId;
    }

    /// @notice Get the extension that minted a token
    function tokenExtension(uint256 tokenId) external view returns (address) {
        require(tokenId > 0 && tokenId <= _tokenCount, "Invalid token");
        return _tokenExtensions[tokenId];
    }

    /// @notice Override tokenURI to delegate to extension if applicable
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId > 0 && tokenId <= _tokenCount, "Invalid token");

        address extension = _tokenExtensions[tokenId];
        if (extension != address(0)) {
            // Check if extension supports ICreatorExtensionTokenURI
            if (extension.supportsInterface(type(ICreatorExtensionTokenURI).interfaceId)) {
                return ICreatorExtensionTokenURI(extension).tokenURI(address(this), tokenId);
            }
        }

        return "";
    }

    /// @notice Get current token count
    function tokenCount() external view returns (uint256) {
        return _tokenCount;
    }
}
