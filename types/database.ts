export interface AvaliacaoChamado {
  chamado_id: string;
  nota: number;
  comentario: string | null;
  created_at: string;
}

export interface Chamado {
  id: string; // uuid
  solicitante: string;
  local: string;
  categoria: string;
  descricao: string;
  status: string; // default 'Pendente'
  resolucao: string | null;
  data_criacao: string; // timestamptz
  data_resolucao: string | null; // timestamptz
  responsavel: string | null;
  tempo_gasto: string | null; // ex: '30m', '1h 30m'
  anexo_url?: string | null; // URL pública ou assinada da imagem no storage
  user_id?: string; // ID do usuário que abriu o chamado (Supabase Auth)
  avaliacao?: AvaliacaoChamado | null;
}
