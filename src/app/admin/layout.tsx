import { AdminSidebar } from "./admin-sidebar";
import "./admin-operations.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="inventory-app">
      <AdminSidebar />
      <div className="inventory-content">{children}</div>
    </div>
  );
}
