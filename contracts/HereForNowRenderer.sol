// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/IHereForNowRenderer.sol";
import "./lib/Base64.sol";

/// @title HereForNowRenderer
/// @author ripe
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
    uint256 private constant LINE_X = 300; // x position
    uint256 private constant LINE_WIDTH = 400; // width (300 to 700)
    uint256 private constant LINE_HEIGHT = 1; // height (1 viewBox unit = 4px output)
    uint256 private constant SOLID_THRESHOLD = 599; // Lines needed for solid coverage (599 / 1)
    uint256 private constant LINE_Y_TOP = 200; // top line y
    uint256 private constant LINE_Y_BOTTOM = 799; // bottom line y

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    string public name;
    string public description;
    string public author;
    string[] private _urls;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        string memory name_,
        string memory description_,
        string memory author_,
        string[] memory urls_
    ) {
        name = name_;
        description = description_;
        author = author_;
        _urls = urls_;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Updates the metadata
    function setMetadata(
        string memory _name,
        string memory _description,
        string memory _author,
        string[] memory urls_
    ) external onlyOwner {
        name = _name;
        description = _description;
        author = _author;
        _urls = urls_;
    }

    /// @notice Returns the URLs
    function urls() external view returns (string[] memory) {
        return _urls;
    }

    /*//////////////////////////////////////////////////////////////
                            RENDER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IHereForNowRenderer
    function tokenURI(
        uint256 activeParticipants
    ) external view override returns (string memory) {
        string memory svg = generateSVG(activeParticipants);
        string memory base64SVG = Base64.encode(bytes(svg));

        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                name,
                '","description":"',
                description,
                '","image":"data:image/svg+xml;base64,',
                base64SVG,
                '","attributes":[{"trait_type":"Present","value":',
                activeParticipants.toString(),
                '}]}'
            )
        );

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(bytes(json))
                )
            );
    }

    /// @inheritdoc IHereForNowRenderer
    /// @dev Uses assembly for gas-efficient string building
    function generateSVG(
        uint256 activeParticipants
    ) public pure override returns (string memory) {
        uint256 totalLines = 2 + activeParticipants;

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
        ptr = _writeString(
            ptr,
            '<svg width="4000" height="4000" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">'
        );
        ptr = _writeString(
            ptr,
            '<defs><rect id="l" width="400" height="1" fill="white"/></defs>'
        );
        ptr = _writeString(
            ptr,
            '<rect width="1000" height="1000" fill="#0A0A0A"/>'
        );

        // Calculate and write lines
        uint256 verticalSpan = LINE_Y_BOTTOM - LINE_Y_TOP; // 599

        if (totalLines >= SOLID_THRESHOLD) {
            // Draw a single white rectangle instead of individual lines
            ptr = _writeString(ptr, '<rect x="300" y="200" width="400" height="600" fill="white"/>');
        } else if (totalLines == 2) {
            ptr = _writeString(ptr, '<use href="#l" x="300" y="200"/>');
            ptr = _writeString(ptr, '<use href="#l" x="300" y="799"/>');
        } else {
            uint256 intervals = totalLines - 1;

            for (uint256 i = 0; i < totalLines; i++) {
                // Quadratic ease-out: sparse at top, dense at bottom
                // t = i * 1000 / intervals (normalized 0-1000)
                // y = top + span * (1 - (1-t)²) = top + span - span * (1000-t)² / 1000000
                uint256 t = (i * 1000) / intervals;
                uint256 invT = 1000 - t;
                uint256 y = LINE_Y_TOP +
                    verticalSpan -
                    (verticalSpan * invT * invT) /
                    1000000;

                ptr = _writeString(ptr, '<use href="#l" x="300" y="');
                ptr = _writeUint(ptr, y);
                ptr = _writeString(ptr, '"/>');
            }
        }

        ptr = _writeString(ptr, "</svg>");

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
    function _writeString(
        uint256 ptr,
        string memory str
    ) internal pure returns (uint256) {
        bytes memory b = bytes(str);
        uint256 len = b.length;

        assembly {
            let src := add(b, 32)
            let dst := ptr
            // Copy 32 bytes at a time
            for {
                let i := 0
            } lt(i, len) {
                i := add(i, 32)
            } {
                mstore(add(dst, i), mload(add(src, i)))
            }

            ptr := add(ptr, len)
        }

        return ptr;
    }

    /// @dev Writes a uint to memory as decimal string, returns new ptr
    function _writeUint(
        uint256 ptr,
        uint256 value
    ) internal pure returns (uint256) {
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
            for {
                let v := value
            } gt(v, 0) {
                v := div(v, 10)
            } {
                end := sub(end, 1)
                mstore8(end, add(48, mod(v, 10)))
            }
            ptr := add(ptr, digits)
        }

        return ptr;
    }

}
