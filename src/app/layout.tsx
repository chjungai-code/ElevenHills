import type { Metadata } from "next";
import { Noto_Sans_KR, DM_Mono } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "일레븐힐스 경영진 대시보드",
  description: "Corporate governance dashboard for 일레븐힐스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={{ background: '#0b0c10', color: '#e8e4dc', fontFamily: 'var(--font-noto), sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
