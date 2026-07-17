"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/admin/products", label: "상품 관리", icon: "box" },
  { href: "/admin/products/import", label: "상품 가져오기", icon: "download" },
  { href: "/admin/channels/naver", label: "판매 채널", icon: "store" },
  { href: "/admin/settings/products", label: "설정", icon: "settings" },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="inventory-sidebar">
      <div className="inventory-brand">
        <div className="inventory-brand-mark">S</div>
        <div>
          <strong>쇼핑데이</strong>
          <span>판매자 상품 관리</span>
        </div>
      </div>
      <nav className="inventory-nav" aria-label="관리자 메뉴">
        {navigation.map((item) => (
          <Link
            key={item.href}
            className={isActive(pathname, item.href) ? "active" : undefined}
            href={item.href}
          >
            <AdminIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="inventory-sidebar-note">
        <AdminIcon name="database" />
        <div>
          <strong>친구도매 연동</strong>
          <span>최근 동기화된 상품을 관리합니다.</span>
        </div>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/admin/products") {
    return (
      pathname === href ||
      (pathname.startsWith("/admin/products/") &&
        pathname !== "/admin/products/import")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AdminIcon({
  name,
}: {
  name: (typeof navigation)[number]["icon"] | "database";
}) {
  const paths: Record<string, ReactNode> = {
    box: (
      <>
        <path d="m21 8-9-5-9 5 9 5 9-5Z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v9" />
        <path d="m21 8v9l-9 5-9-5V8" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v10h16V10" />
        <path d="M3 4h18l-2 6H5L3 4Z" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
  };
  return (
    <svg
      className="inventory-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
