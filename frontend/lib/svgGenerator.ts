/**
 * TypeScript port of HereForNowRenderer.sol SVG generation algorithm
 * Generates SVG artwork based on active participant count
 */

// Constants matching Solidity contract
const OUTPUT_SIZE = 4000;
const VIEWBOX_SIZE = 1000;
const LINE_X = 300;
const LINE_WIDTH = 400;
const LINE_HEIGHT = 4;
const LINE_Y_TOP = 200;
const LINE_Y_BOTTOM = 799;
const SOLID_THRESHOLD = 420;

/**
 * Generate SVG markup for the artwork given a participant count
 * @param activeParticipants Number of active participants (0+)
 * @returns SVG string
 */
export function generateSVG(activeParticipants: number): string {
  const totalLines = 2 + activeParticipants;
  const verticalSpan = LINE_Y_BOTTOM - LINE_Y_TOP; // 599

  let lines = "";

  if (totalLines >= SOLID_THRESHOLD) {
    // Solid rectangle when threshold exceeded
    lines = '<rect x="300" y="200" width="400" height="600" fill="white"/>';
  } else if (totalLines === 2) {
    // Just top and bottom lines
    lines = '<use href="#l" x="300" y="200"/><use href="#l" x="300" y="799"/>';
  } else {
    // Quadratic ease-out distribution: sparse at top, dense at bottom
    const intervals = totalLines - 1;
    for (let i = 0; i < totalLines; i++) {
      // t = i * 1000 / intervals (normalized 0-1000)
      // y = top + span - span * (1000 - t)^2 / 1000000
      const t = Math.floor((i * 1000) / intervals);
      const invT = 1000 - t;
      const y =
        LINE_Y_TOP +
        verticalSpan -
        Math.floor((verticalSpan * invT * invT) / 1000000);
      lines += `<use href="#l" x="300" y="${y}"/>`;
    }
  }

  return `<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><defs><rect id="l" width="${LINE_WIDTH}" height="${LINE_HEIGHT}" fill="white"/></defs><rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" fill="#0A0A0A"/>${lines}</svg>`;
}

/**
 * Generate a data URI for the SVG (for use in img src)
 * @param activeParticipants Number of active participants
 * @returns Data URI string
 */
export function generateSVGDataURI(activeParticipants: number): string {
  const svg = generateSVG(activeParticipants);
  // Use btoa for browser, works in Next.js client components
  if (typeof window !== "undefined") {
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
  // Fallback for SSR (though this component should be client-only)
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
