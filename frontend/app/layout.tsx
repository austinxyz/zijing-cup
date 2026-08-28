import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

// Noto Sans SC carries the Chinese UI copy; JetBrains Mono carries every
// number on screen — UTR values, caps, buffer budgets. Tabular figures matter
// here: a column of caps that doesn't line up is harder to scan for the one
// value that changed this season.
const notoSansSC = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "紫荆杯 · 球队与阵容分析",
  description: "紫荆杯校友网球团体赛的赛制规则、球队名单与阵容分析",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh"
      className={`${notoSansSC.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
