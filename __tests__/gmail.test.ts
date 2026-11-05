// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/integracoes/gmail/route';

const { createClient, from, maybeSingle, single, insert, upload, listUsers } = vi.hoisted(() => ({
  createClient: vi.fn(), from: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(), insert: vi.fn(), upload: vi.fn(), listUsers: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
const segredo = 'a'.repeat(40);
const dados = { messageId: 'abc123', mailbox: 'help@gmail.com', remetente: 'professor@maplebeararaxa.com.br', nome: 'Professor',
  assunto: '[ALTA] Projetor', texto: 'O projetor não liga.', dataEmail: '2026-10-14T12:00:00.000Z', originalBase64: 'YWJj' };
function request(body = dados, token = segredo) {
  return new Request('https://maple.test/api/integracoes/gmail', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GMAIL_WEBHOOK_SECRET', segredo); vi.stubEnv('GMAIL_MAILBOX', 'help@gmail.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle, single, insert };
  insert.mockReturnValue(chain); from.mockReturnValue(chain);
  createClient.mockReturnValue({ from, auth: { admin: { listUsers } }, storage: { from: () => ({ upload }) } });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  single.mockResolvedValueOnce({ data: { prazo_horas: 4 }, error: null }).mockResolvedValueOnce({ data: { id: 'ticket-1' }, error: null });
  listUsers.mockResolvedValue({ data: { users: [{ id: 'user-1', email: dados.remetente, email_confirmed_at: '2026-01-01' }] }, error: null });
  upload.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('Entrada Gmail', () => {
  it('rejeita segredo incorreto antes de acessar banco ou conteúdo', async () => {
    expect((await POST(request(dados, 'incorreto'))).status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('fica desativada sem configuração', async () => {
    vi.stubEnv('GMAIL_WEBHOOK_SECRET', '');
    expect((await POST(request())).status).toBe(503);
  });
  it('retorna protocolo existente sem importar nem enviar qualquer e-mail', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'anterior' }, error: null });
    expect(await (await POST(request())).json()).toEqual({ id: 'anterior', duplicado: true });
    expect(upload).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  });
  it('preserva mensagem, vincula o usuário e aplica prioridade do assunto sem aceitar prazo externo', async () => {
    expect((await POST(request())).status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ prioridade: 'alta', user_id: 'user-1', origem: 'email', email_message_id: 'help@gmail.com:abc123' }));
    expect(insert.mock.calls[0][0]).not.toHaveProperty('sla_vence_em');
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/\.eml$/), Buffer.from('abc'), expect.objectContaining({ upsert: false }));
  });
  it('mantém na fila remetentes desconhecidos e SLA não configurado', async () => {
    listUsers.mockResolvedValueOnce({ data: { users: [] }, error: null });
    expect((await POST(request())).status).toBe(422);
    expect(insert).not.toHaveBeenCalled();
    single.mockReset().mockResolvedValue({ data: { prazo_horas: null }, error: null });
    expect((await POST(request())).status).toBe(503);
    expect(upload).not.toHaveBeenCalled();
  });
  it('recusa outra caixa ou assunto ambíguo', async () => {
    expect((await POST(request({ ...dados, mailbox: 'outra@gmail.com' }))).status).toBe(403);
    expect((await POST(request({ ...dados, assunto: '[BAIXA] [ALTA]' }))).status).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });
  it('trata conflito de inserções simultâneas como reenvio', async () => {
    single.mockReset().mockResolvedValueOnce({ data: { prazo_horas: 4 } })
      .mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ data: { id: 'concorrente' } });
    expect(await (await POST(request())).json()).toEqual({ id: 'concorrente', duplicado: true });
  });
});
