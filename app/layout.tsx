import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MM Games · Weekly Arcade",
  description: "Seven minimalist game experiences crafted for each day of the week.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
