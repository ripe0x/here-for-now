import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const title = "Here, For Now";
const description =
  "A shared intimate space held by a single collector. Anyone can enter through a small onchain act of presence, shaping the image for as long as they choose to remain.";
const url = "https://hfn.ripe.wtf";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(url),
  keywords: ["NFT", "onchain art", "generative art", "Ethereum", "Manifold"],
  authors: [{ name: "ripe", url: "https://ripe.wtf" }],
  creator: "ripe",
  openGraph: {
    title,
    description,
    url,
    siteName: title,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@raborari",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white font-mono antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
