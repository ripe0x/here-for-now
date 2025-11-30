// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@manifoldxyz/libraries-solidity/contracts/access/AdminControl.sol";
import "@manifoldxyz/creator-core-solidity/contracts/core/IERC721CreatorCore.sol";
import "@manifoldxyz/creator-core-solidity/contracts/extensions/ICreatorExtensionTokenURI.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IHereForNowRenderer.sol";
import "./interfaces/ISculpture.sol";

/// @title HereForNowExtension
/// @notice A Manifold extension for the "Here, For Now" conceptual artwork
/// @author ripe
/// @dev Allows addresses to enter by holding ETH to be "present" with the piece.
///      Each non-zero balance adds a line to the visual representation.
///      ETH is never used - it simply represents presence until leaving.
contract HereForNowExtension is
    AdminControl,
    ICreatorExtensionTokenURI,
    ReentrancyGuard,
    ISculpture
{
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidCore();
    error InvalidTokenId();
    error AlreadyInitialized();
    error NotInitialized();
    error ZeroAmount();
    error NoBalance();
    error TransferFailed();
    error DirectTransferNotAllowed();
    error RendererNotSet();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Entered(
        address indexed participant,
        uint256 amount,
        uint256 newBalance
    );
    event Left(address indexed participant, uint256 amount);
    event RendererUpdated(address indexed newRenderer);
    event Initialized(address indexed core, uint256 tokenId);

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The Manifold creator core contract address
    address public core;

    /// @notice The token ID associated with this extension (should be 2)
    uint256 public tokenId;

    /// @notice The renderer contract that generates SVG and metadata
    address public renderer;

    /// @notice Whether the extension has been initialized
    bool public initialized;

    /// @notice Balance of ETH held by each address
    mapping(address => uint256) public balanceOf;

    /// @notice Total ETH held in the contract
    uint256 public totalBalance;

    /// @notice Number of addresses with non-zero balance
    uint256 public activeParticipants;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor() {
        // AdminControl uses msg.sender as initial admin
    }

    /*//////////////////////////////////////////////////////////////
                         INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initialize the extension with the creator core and mint the token
    /// @param _core The Manifold creator core contract address
    /// @dev This mints a new token via the extension. The token ID will be
    ///      determined by the core contract's current token count + 1.
    ///      For this artwork, we expect it to be token ID 2.
    function initialize(address _core) external adminRequired {
        if (initialized) revert AlreadyInitialized();
        if (_core == address(0)) revert InvalidCore();

        core = _core;
        initialized = true;

        // Mint the token to the admin (deployer)
        // The token ID is assigned by the core contract
        tokenId = IERC721CreatorCore(_core).mintExtension(msg.sender);

        emit Initialized(_core, tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                         MANIFOLD INTERFACE
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if the contract supports a given interface
    /// @param interfaceId The interface identifier
    /// @return True if the interface is supported
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AdminControl, IERC165) returns (bool) {
        return
            interfaceId == type(ICreatorExtensionTokenURI).interfaceId ||
            interfaceId == type(ISculpture).interfaceId ||
            AdminControl.supportsInterface(interfaceId) ||
            super.supportsInterface(interfaceId);
    }

    /// @notice Returns the token URI for the artwork
    /// @param _core The creator core contract (must match our core)
    /// @param _tokenId The token ID (must match our tokenId)
    /// @return The complete token URI with metadata and SVG
    function tokenURI(
        address _core,
        uint256 _tokenId
    ) external view override returns (string memory) {
        if (!initialized) revert NotInitialized();
        if (_core != core) revert InvalidCore();
        if (_tokenId != tokenId) revert InvalidTokenId();
        if (renderer == address(0)) revert RendererNotSet();

        return
            IHereForNowRenderer(renderer).tokenURI(
                activeParticipants
            );
    }

    /*//////////////////////////////////////////////////////////////
                         PRESENCE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Enter by holding ETH to become present with the artwork
    /// @dev Increments the participant's balance and potentially adds a new line
    function enter() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        // Track if this is a new participant (balance was zero)
        bool wasZero = balanceOf[msg.sender] == 0;

        // Update balances
        balanceOf[msg.sender] += msg.value;
        totalBalance += msg.value;

        // If this is a new participant, increment active count
        if (wasZero) {
            activeParticipants++;
        }

        emit Entered(msg.sender, msg.value, balanceOf[msg.sender]);
    }

    /// @notice Leave the artwork and reclaim all ETH
    /// @dev Full withdrawal only - no partial withdrawals allowed
    function leave() external nonReentrant {
        uint256 balance = balanceOf[msg.sender];
        if (balance == 0) revert NoBalance();

        // Update state before transfer (CEI pattern)
        balanceOf[msg.sender] = 0;
        totalBalance -= balance;
        activeParticipants--;

        // Transfer ETH back to participant
        (bool success, ) = msg.sender.call{value: balance}("");
        if (!success) revert TransferFailed();

        emit Left(msg.sender, balance);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the balance of a specific address
    /// @param account The address to query
    /// @return The ETH balance held by this address
    function getBalance(address account) external view returns (uint256) {
        return balanceOf[account];
    }

    /// @notice Get the total ETH held in the contract
    /// @return The total balance in wei
    function getTotalBalance() external view returns (uint256) {
        return totalBalance;
    }

    /// @notice Get the number of active participants
    /// @return The count of addresses with non-zero balance
    function getActiveParticipants() external view returns (uint256) {
        return activeParticipants;
    }

    /// @notice Check if an address is currently present (has non-zero balance)
    /// @param account The address to check
    /// @return True if the address has a non-zero balance
    function isPresent(address account) external view returns (bool) {
        return balanceOf[account] > 0;
    }

    /// @notice Get the raw SVG for the current state
    /// @return The SVG string
    function svg() external view returns (string memory) {
        if (renderer == address(0)) revert RendererNotSet();
        return IHereForNowRenderer(renderer).generateSVG(activeParticipants);
    }

    /*//////////////////////////////////////////////////////////////
                        SCULPTURE INTERFACE
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the title of the artwork
    function title() external view override returns (string memory) {
        if (renderer == address(0)) revert RendererNotSet();
        return IHereForNowRenderer(renderer).name();
    }

    /// @notice Returns the authors of the artwork
    function authors() external view override returns (string[] memory) {
        if (renderer == address(0)) revert RendererNotSet();
        string[] memory a = new string[](1);
        a[0] = IHereForNowRenderer(renderer).author();
        return a;
    }

    /// @notice Returns the addresses associated with the artwork
    function addresses() external view override returns (address[] memory) {
        address[] memory a = new address[](2);
        a[0] = core; // Token contract (Manifold)
        a[1] = address(this); // Extension contract
        return a;
    }

    /// @notice Returns URLs associated with the artwork
    function urls() external view override returns (string[] memory) {
        if (renderer == address(0)) revert RendererNotSet();
        return IHereForNowRenderer(renderer).urls();
    }

    /// @notice Returns descriptive text about the artwork
    function text() external view override returns (string memory) {
        if (renderer == address(0)) revert RendererNotSet();
        return IHereForNowRenderer(renderer).description();
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Update the renderer contract address
    /// @param _renderer The new renderer contract address
    function setRenderer(address _renderer) external adminRequired {
        renderer = _renderer;
        emit RendererUpdated(_renderer);
    }

    /*//////////////////////////////////////////////////////////////
                         RECEIVE / FALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @notice Reject direct ETH transfers - must use enter()
    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    /// @notice Reject fallback calls
    fallback() external payable {
        revert DirectTransferNotAllowed();
    }
}
