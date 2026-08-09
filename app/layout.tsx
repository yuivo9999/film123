import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "坐哪儿 - Cinema Seat & 3D Auditorium Simulator",
  description: "采用 Three.js & WebGL 打造的 3D 悬浮影厅视线与座位体验模拟器",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-[#0e0c0a] text-[#f2ede4] min-h-screen selection:bg-amber-800 selection:text-amber-100">
        {children}
      </body>
    </html>
  );
}
