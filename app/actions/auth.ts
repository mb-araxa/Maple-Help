'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorar erro se for chamado de um Server Component
          }
        },
      },
    }
  );
}

export type UserRole = 'requester' | 'technician' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  avatar_url: string | null;
}

/**
 * Retorna o usuário logado de forma segura usando getUser().
 */
export async function getSecureUser() {
  const supabase = await getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('Usuário não autenticado.');
  }

  return user;
}

/**
 * Retorna o perfil do usuário logado diretamente da tabela profiles.
 */
export async function getCurrentProfile(): Promise<UserProfile> {
  const user = await getSecureUser();
  const supabase = await getSupabase();
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
    
  if (error || !profile) {
    // Fallback: If profile doesn't exist yet (e.g., trigger hasn't run or is delayed), 
    // we can return a temporary object for the session to not break.
    // However, the best approach is to fail securely.
    throw new Error('Perfil não encontrado.');
  }
  
  return profile as UserProfile;
}

/**
 * Garante que o usuário logado possui uma das roles especificadas.
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const profile = await getCurrentProfile();
  
  if (!allowedRoles.includes(profile.role)) {
    throw new Error('Acesso negado: permissão insuficiente.');
  }
  
  return profile;
}

/**
 * Validação de permissão de administrador.
 */
export async function requireAdmin() {
  return requireRole(['admin']);
}

/**
 * Validação de permissão de técnico ou administrador.
 */
export async function requireTechnicianOrAdmin() {
  return requireRole(['admin', 'technician']);
}

/**
 * Validação básica apenas de autenticação.
 */
export async function requireAuthenticatedUser() {
  return getCurrentProfile();
}

/**
 * Função utilitária para uso seguro no frontend (sem expor exceções diretas)
 */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const profile = await getCurrentProfile();
    return profile.role === 'admin';
  } catch {
    return false;
  }
}

export async function checkIsTechnicianOrAdmin(): Promise<boolean> {
  try {
    const profile = await getCurrentProfile();
    return profile.role === 'admin' || profile.role === 'technician';
  } catch {
    return false;
  }
}
