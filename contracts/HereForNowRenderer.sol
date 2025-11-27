// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/IHereForNowRenderer.sol";
import "./lib/Base64.sol";

/// @title HereForNowRenderer
/// @notice Generates SVG artwork and metadata for the HereForNow piece
/// @dev Uses assembly-optimized string building and viewBox scaling for gas efficiency
contract HereForNowRenderer is IHereForNowRenderer, Ownable {
    using Strings for uint256;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    // Output dimensions (what the SVG renders at)
    uint256 private constant OUTPUT_SIZE = 4000;

    // Internal viewBox dimensions (scaled 4x to output)
    uint256 private constant VIEWBOX_SIZE = 1000;

    // Line positioning (in viewBox coordinates)
    uint256 private constant LINE_X = 300;       // x position
    uint256 private constant LINE_WIDTH = 400;   // width (300 to 700)
    uint256 private constant LINE_HEIGHT = 1;    // height
    uint256 private constant LINE_Y_TOP = 200;   // top line y
    uint256 private constant LINE_Y_BOTTOM = 799; // bottom line y

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    string public name;
    string public description;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor() {
        name = "Here, For Now";
        description = "This work treats the chain as a place where presence can be held, not just seen. Living directly on programmable money, it uses ETH itself as the material for showing up: a single contract where people leave part of their balance alongside others, with no yield and no reward. Being present here simply means letting some of your ETH remain for a while. Withdrawing it is always possible, but each decision to stay or to leave is reflected in the brightness of the image and in the brief overlap of everyone who chose to be here at the same time.";
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Updates the metadata name and description
    function setMetadata(
        string memory _name,
        string memory _description
    ) external onlyOwner {
        name = _name;
        description = _description;
    }

    /*//////////////////////////////////////////////////////////////
                            RENDER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IHereForNowRenderer
    function tokenURI(
        uint256 activeDepositors,
        uint256 totalBalance
    ) external view override returns (string memory) {
        string memory svg = generateSVG(activeDepositors);
        string memory base64SVG = Base64.encode(bytes(svg));

        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                name,
                '","description":"',
                description,
                '","image":"data:image/svg+xml;base64,',
                base64SVG,
                '","attributes":[{"trait_type":"Present Depositors","value":',
                activeDepositors.toString(),
                '},{"trait_type":"Total ETH Held","value":"',
                _formatEther(totalBalance),
                '"}]}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }

    /// @inheritdoc IHereForNowRenderer
    /// @dev Uses assembly for gas-efficient string building
    function generateSVG(uint256 activeDepositors) public pure override returns (string memory) {
        uint256 totalLines = 2 + activeDepositors;

        // Pre-calculate buffer size
        // Header: ~185 bytes, each line: ~28 bytes max, footer: 6 bytes
        uint256 bufferSize = 200 + (totalLines * 30) + 10;

        bytes memory buffer = new bytes(bufferSize);
        uint256 ptr;

        assembly {
            ptr := add(buffer, 32) // Skip length prefix
        }

        // Write SVG header with viewBox scaling
        // Output: 4000x4000, ViewBox: 1000x1000 (4x scale)
        ptr = _writeString(ptr, '<svg width="4000" height="4000" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">');
        ptr = _writeString(ptr, '<defs><rect id="l" width="400" height="1" fill="white"/></defs>');
        ptr = _writeString(ptr, '<rect width="1000" height="1000" fill="#0A0A0A"/>');

        // Calculate and write lines
        uint256 verticalSpan = LINE_Y_BOTTOM - LINE_Y_TOP; // 599

        if (totalLines == 2) {
            ptr = _writeString(ptr, '<use href="#l" x="300" y="200"/>');
            ptr = _writeString(ptr, '<use href="#l" x="300" y="799"/>');
        } else {
            uint256 intervals = totalLines - 1;

            for (uint256 i = 0; i < totalLines; i++) {
                // Calculate y with rounding: y = 200 + round(599 * i / intervals)
                uint256 y = LINE_Y_TOP + ((verticalSpan * i) + (intervals >> 1)) / intervals;

                ptr = _writeString(ptr, '<use href="#l" x="300" y="');
                ptr = _writeUint(ptr, y);
                ptr = _writeString(ptr, '"/>');
            }
        }

        ptr = _writeString(ptr, '</svg>');

        // Set actual length
        assembly {
            let actualLen := sub(ptr, add(buffer, 32))
            mstore(buffer, actualLen)
        }

        return string(buffer);
    }

    /*//////////////////////////////////////////////////////////////
                      ASSEMBLY STRING HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Writes a string to memory at ptr, returns new ptr
    function _writeString(uint256 ptr, string memory str) internal pure returns (uint256) {
        bytes memory b = bytes(str);
        uint256 len = b.length;

        assembly {
            let src := add(b, 32)
            let dst := ptr

            // Copy 32 bytes at a time
            for { let i := 0 } lt(i, len) { i := add(i, 32) } {
                mstore(add(dst, i), mload(add(src, i)))
            }

            ptr := add(ptr, len)
        }

        return ptr;
    }

    /// @dev Writes a uint to memory as decimal string, returns new ptr
    function _writeUint(uint256 ptr, uint256 value) internal pure returns (uint256) {
        if (value == 0) {
            assembly {
                mstore8(ptr, 48) // '0'
                ptr := add(ptr, 1)
            }
            return ptr;
        }

        // Count digits
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        // Write digits in reverse
        assembly {
            let end := add(ptr, digits)
            for { let v := value } gt(v, 0) { v := div(v, 10) } {
                end := sub(end, 1)
                mstore8(end, add(48, mod(v, 10)))
            }
            ptr := add(ptr, digits)
        }

        return ptr;
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Formats wei to ETH string with 4 decimal places
    function _formatEther(uint256 weiAmount) internal pure returns (string memory) {
        uint256 whole = weiAmount / 1e18;
        uint256 fraction = (weiAmount % 1e18) / 1e14;

        string memory fractionStr;
        if (fraction == 0) {
            fractionStr = "0000";
        } else if (fraction < 10) {
            fractionStr = string(abi.encodePacked("000", fraction.toString()));
        } else if (fraction < 100) {
            fractionStr = string(abi.encodePacked("00", fraction.toString()));
        } else if (fraction < 1000) {
            fractionStr = string(abi.encodePacked("0", fraction.toString()));
        } else {
            fractionStr = fraction.toString();
        }

        return string(abi.encodePacked(whole.toString(), ".", fractionStr, " ETH"));
    }
}
