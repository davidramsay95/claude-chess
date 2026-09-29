import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Club Room Chess",
  description: "Play chess against a computer opponent at four levels of difficulty.",
};

/** Root layout: loads the typefaces and the ink background shared by every screen. */
export default function RootLayout({ children }: LayoutProps<"/">): React.JSX.Element {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrumentSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink font-sans text-parchment">{children}</body>
    </html>
  );
}
