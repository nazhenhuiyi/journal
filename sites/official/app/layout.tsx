import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "且留此刻 | 把此刻，轻轻留下",
  description:
    "且留此刻是一个低负担的个人日记应用。写一页、留一句、放一张照片，都算数。",
  icons: {
    icon: "/brand/qieliu-logo.png",
    apple: "/brand/qieliu-logo.png",
  },
  openGraph: {
    title: "且留此刻",
    description: "把今天轻轻安放下来。",
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
