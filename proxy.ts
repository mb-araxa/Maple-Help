import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // A função getUser() checa a validade do JWT garantindo que a sessão não foi forjada.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmRoute = request.nextUrl.pathname.startsWith('/adm');

  // Proteção da Rota do Painel ADM
  if (isAdmRoute) {
    if (!user || !user.email) {
      const url = request.nextUrl.clone();
      url.pathname = user ? '/menu' : '/';
      return NextResponse.redirect(url);
    }

    // Consulta a fonte única no banco (public.app_admins) protegida por RLS
    const { data: adminRecord, error: adminError } = await supabase
      .from('app_admins')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    const envEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isEmailAdminEnv = envEmails.includes(user.email.toLowerCase());

    const isAdmin = (adminError && adminError.code === '42P01')
      ? isEmailAdminEnv
      : !!adminRecord;

    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/menu';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Intercepta todas as requisições exceto arquivos estáticos (.png, favicon, etc) 
     * e requisições internas do Next.js
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
