import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "且留此刻 | 私人日记应用",
  description:
    "且留此刻是一款私人日记应用，把文字、照片、地点和日期放在同一天里。本地优先，支持私有仓库，适合只写给自己的日常记录。",
  icons: {
    icon: "/brand/qieliu-logo.png",
    apple: "/brand/qieliu-logo.png",
  },
  openGraph: {
    title: "且留此刻",
    description:
      "不打卡，不表演，不把生活整理成作品。把一句话、照片、地点和日期留给未来的自己回看。",
    images: [
      {
        url: "/hero/qieliu-hero.webp",
        width: 2400,
        height: 1351,
        alt: "且留此刻产品界面氛围图",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#fdfdfd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full scroll-smooth antialiased">
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
