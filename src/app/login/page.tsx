import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/admin/products");

  return (
    <main className="container login-container">
      <h1>관리자 로그인</h1>
      <p>Supabase에 등록한 관리자 계정으로 로그인하세요.</p>
      <LoginForm />
    </main>
  );
}
