import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoTube Studio",
  description: "스타일 프리셋으로 유튜브 영상을 기획하고 캡컷으로 넘기는 개인용 도구",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="shell">
          <header className="top">
            <h1>AutoTube Studio</h1>
            <nav>
              <Link href="/">프로젝트</Link>
              <Link href="/presets">스타일 프리셋</Link>
              <Link href="/settings">연결 상태</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
