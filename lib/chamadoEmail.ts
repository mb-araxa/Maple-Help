import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { Chamado } from '@/types/database';

type EventoChamado = 'assumido' | 'concluido';

function escaparHtml(valor: string) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function obterUrlAplicacao() {
  const urlConfigurada = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (urlConfigurada) return urlConfigurada.replace(/\/$/, '');

  const urlVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (urlVercel) return `https://${urlVercel}`;

  return 'https://maple-help.vercel.app';
}

function montarEmail(chamado: Chamado, evento: EventoChamado) {
  const solicitante = escaparHtml(chamado.solicitante);
  const categoria = escaparHtml(chamado.categoria);
  const local = escaparHtml(chamado.local);
  const responsavel = escaparHtml(chamado.responsavel || 'Equipe de TI');
  const numero = escaparHtml(chamado.id.slice(0, 8).toUpperCase());

  if (evento === 'assumido') {
    return {
      subject: `Chamado ${numero} aceito pela equipe de TI`,
      html: `
        <div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,sans-serif;color:#27272a">
          <div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7">
            <div style="background:#e31837;color:#fff;padding:22px 28px;font-size:22px;font-weight:700">Maple Help</div>
            <div style="padding:28px">
              <h1 style="font-size:21px;margin:0 0 18px">Seu chamado foi aceito</h1>
              <p>Olá, ${solicitante}. A equipe de TI iniciou o atendimento do seu chamado.</p>
              <div style="background:#fafafa;border-radius:10px;padding:16px;margin:20px 0;line-height:1.7">
                <strong>Chamado:</strong> ${numero}<br>
                <strong>Categoria:</strong> ${categoria}<br>
                <strong>Local:</strong> ${local}<br>
                <strong>Responsável:</strong> ${responsavel}
              </div>
              <p style="color:#71717a;font-size:14px">Você receberá outro aviso quando o atendimento for concluído.</p>
            </div>
          </div>
        </div>`,
    };
  }

  const urlAvaliacao = `${obterUrlAplicacao()}/chamado/meus-chamados`;
  const resolucao = escaparHtml(chamado.resolucao || 'Atendimento concluído pela equipe de TI.');

  return {
    subject: `Chamado ${numero} concluído — avalie o atendimento`,
    html: `
      <div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,sans-serif;color:#27272a">
        <div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7">
          <div style="background:#e31837;color:#fff;padding:22px 28px;font-size:22px;font-weight:700">Maple Help</div>
          <div style="padding:28px">
            <h1 style="font-size:21px;margin:0 0 18px">Seu chamado foi concluído</h1>
            <p>Olá, ${solicitante}. O atendimento do chamado ${numero} foi finalizado.</p>
            <div style="background:#fafafa;border-radius:10px;padding:16px;margin:20px 0;line-height:1.7">
              <strong>Categoria:</strong> ${categoria}<br>
              <strong>Local:</strong> ${local}<br>
              <strong>Solução:</strong> ${resolucao}
            </div>
            <p>Sua avaliação ajuda a equipe de TI a melhorar o atendimento.</p>
            <a href="${urlAvaliacao}" style="display:inline-block;background:#e31837;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px;margin-top:8px">Avaliar atendimento</a>
          </div>
        </div>
      </div>`,
  };
}

export async function enviarEmailDeAtualizacao(
  chamado: Chamado,
  evento: EventoChamado
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const dominioResend = process.env.RESEND_EMAIL_DOMAIN;
  const remetente = process.env.RESEND_FROM_EMAIL
    || (dominioResend ? `Maple Help <chamados@${dominioResend}>` : undefined);

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !remetente || !chamado.user_id) {
    console.warn('Notificação por e-mail não enviada: configuração incompleta.');
    return false;
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(chamado.user_id);
    const destinatario = data.user?.email;

    if (error || !destinatario) {
      console.warn('Notificação por e-mail não enviada: destinatário indisponível.');
      return false;
    }

    const conteudo = montarEmail(chamado, evento);
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `maple-help-${chamado.id}-${evento}`,
      },
      body: JSON.stringify({
        from: remetente,
        to: [destinatario],
        subject: conteudo.subject,
        html: conteudo.html,
      }),
    });

    if (!resposta.ok) {
      console.error(`Falha ao enviar notificação por e-mail (HTTP ${resposta.status}).`);
      return false;
    }

    return true;
  } catch {
    console.error('Falha inesperada ao enviar notificação por e-mail.');
    return false;
  }
}
