import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Here, For Now",
  description: "A living artwork shaped by the presence of programmable money",
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
