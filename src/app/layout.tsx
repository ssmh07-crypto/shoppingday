import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'PIM Admin', description: '공급처 상품 관리' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>
}
