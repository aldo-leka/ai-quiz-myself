import type { Metadata } from "next"
import "./globals.css"
import localFont from "next/font/local"
import { GameProvider } from "@/context/GameContext"
import RequireUsername from "@/components/RequireUsername"

const bitCountGridSingle = localFont({
  src: './fonts/BitcountGridSingle.ttf',
})

export const metadata: Metadata = {
  title: "QuizPlus",
  description: "Multiplayer AI Quiz Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${bitCountGridSingle.className} antialiased bg-radial from-teal-50 from-40% to-green-200`}
      >
        <GameProvider>
          <RequireUsername>
            {children}
          </RequireUsername>
        </GameProvider>
      </body>
    </html>
  );
}
