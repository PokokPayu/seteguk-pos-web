import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: berkas "middleware" berganti nama jadi "proxy" (fungsinya sama —
// lihat catatan migrasi di node_modules/next/dist/docs/.../upgrading/version-16.md).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims(): verifikasi JWT lokal (WebCrypto) bila project memakai signing
  // key asimetris; bila masih HS256 otomatis fallback verifikasi ke server.
  // Token yang di-revoke tetap lolos di sini sampai kedaluwarsa — gerbang
  // per-request-nya cek profiles.aktif di getPengguna().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const diLogin = request.nextUrl.pathname.startsWith("/login");
  if (!claims && !diLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (claims && diLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
