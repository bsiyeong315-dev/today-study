import type { Metadata } from "next";
import "./globals.css";

// 브라우저 탭 제목과 검색엔진용 설명
export const metadata: Metadata = {
  title: "오늘공부",
  description: "남은 단원으로 공부 계획을 짜고, 난이도별 수학 문제를 풀어보는 공부 도우미",
};

// 모든 페이지에 공통으로 씌우는 틀
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
