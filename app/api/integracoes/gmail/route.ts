import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { emailEntradaSchema, MAX_EMAIL_REQUEST_BYTES } from '@/lib/emailEntrada';

export const runtime = 'nodejs';

async function lerCorpoLimitado(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Corpo ausente');
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    tamanho += value.byteLength;
    if (tamanho > MAX_EMAIL_REQUEST_BYTES) { await reader.cancel(); throw new Error('Limite excedido'); }
    partes.push(value);
  }
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

export async function POST(request: Request) {
  const segredo = process.env.GMAIL_WEBHOOK_SECRET;
  const mailbox = process.env.GMAIL_MAILBOX?.toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!segredo || segredo.length < 32 || !mailbox || !url || !chave) {
    return Response.json({ erro: 'Integração não configurada.' }, { status: 503 });
  }
  const recebido = request.headers.get('authorization') || '';
  const esperado = `Bearer ${segredo}`;
  if (Buffer.byteLength(recebido) !== Buffer.byteLength(esperado)
    || !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
    return Response.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  let email;

  try {
    email = emailEntradaSchema.parse(await lerCorpoLimitado(request));

  } catch {
    return Response.json({ erro: 'E-mail inválido ou tamanho excedido.' }, { status: 422 });
  }
  if (email.mailbox !== mailbox) return Response.json({ erro: 'Caixa não autorizada.' }, { status: 403 });
  const original = Buffer.from(email.originalBase64, 'base64');
  if (original.byteLength > 2_500_000) return Response.json({ erro: 'E-mail original excede 2,5 MB.' }, { status: 413 });

  const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const messageId = `${mailbox}:${email.messageId}`;
  const caminho = `${createHash('sha256').update(messageId).digest('hex')}.eml`;
  try {
    const { data: existente, error: erroBusca } = await supabase.from('chamados')
      .select('id').eq('email_message_id', messageId).maybeSingle();
    if (erroBusca) throw erroBusca;
    if (existente) return Response.json({ id: existente.id, duplicado: true });

    // Vincula somente a conta institucional já cadastrada e com e-mail confirmado.
    let userId: string | undefined;
    for (let pagina = 1; ; pagina++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 1000 });
      if (error) throw error;
      const user = data.users.find(u => u.email?.toLowerCase() === email.remetente && u.email_confirmed_at);
      if (user) { userId = user.id; break; }
      if (data.users.length < 1000) break;
    }
    if (!userId) return Response.json({ erro: 'Remetente precisa de cadastro institucional confirmado no Maple Help.' }, { status: 422 });

    const { error: erroUpload } = await supabase.storage.from('chamados-emails').upload(caminho, original,
      { contentType: 'application/octet-stream', upsert: false });
    // Arquivo determinístico permite retentar uma falha posterior ao upload sem duplicá-lo.
    if (erroUpload && String(erroUpload.statusCode) !== '409' && erroUpload.message !== 'The resource already exists') throw erroUpload;
    const { data: chamado, error } = await supabase.from('chamados').insert({
      solicitante: email.nome || email.remetente,
      local: 'Não informado no formulário — recebido por e-mail',
      categoria: 'E-mail / Triagem',
      descricao: `Assunto: ${email.assunto || '(sem assunto)'}\nDe: ${email.remetente}\nData do e-mail: ${email.dataEmail}\n\n${email.texto || '(sem texto; consulte o e-mail original)'}`,
      status: 'Pendente', user_id: userId, prioridade: null, data_criacao: email.dataEmail, origem: 'email',
      email_remetente: email.remetente, email_assunto: email.assunto,
      email_message_id: messageId, email_original_path: caminho,
    }).select('id').single();
    if (error?.code === '23505') {
      const { data: repetido, error: erroRepetido } = await supabase.from('chamados')
        .select('id').eq('email_message_id', messageId).single();
      if (erroRepetido) throw erroRepetido;
      return Response.json({ id: repetido.id, duplicado: true });
    }
    if (error) throw error;
    return Response.json({ id: chamado.id }, { status: 201 });
  } catch {
    // Não registrar conteúdo, endereços ou credenciais em logs do servidor.
    return Response.json({ erro: 'Falha ao importar; a mensagem poderá ser reenviada com o mesmo ID.' }, { status: 503 });
  }
}
