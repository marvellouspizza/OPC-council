import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPC Council - 会议室",
  description: "基于多智能体博弈与 SecondMe 身份映射的生活优化生态系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-[#080818] text-white font-sans">
        {children}
      </body>
    </html>
  );
}
