import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secure Transaction Service",
  description: "Envelope Encryption with AES-256-GCM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
