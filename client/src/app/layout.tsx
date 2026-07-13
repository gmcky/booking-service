import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/Providers";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GMCK Booking",
    template: "%s · GMCK Booking",
  },
  description: "Find and book unique places to stay",
  openGraph: {
    title: "GMCK Booking",
    description: "Find and book unique places to stay",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Providers>{children}</Providers>
        <MobileBottomNav />
      </body>
    </html>
  );
}
