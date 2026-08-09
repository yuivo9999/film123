import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "坐哪儿 · 3D WebGL 影厅视角模拟器",
  description: "复刻日系原木私影、千人巨幕、杜比影院与 IMAX 激光厅，体验真实的视线包围感与画面尺寸映射。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-[#0c0a08] text-[#f4eee6]">{children}</body>
    </html>
  );
}
