/**
 * Instalar na conta Gmail do Maple Help. Leia docs/SLA_E_GMAIL.md antes de ativar.
 * Script Properties: MAPLE_HELP_URL, GMAIL_WEBHOOK_SECRET, GMAIL_MAILBOX.
 * Não envia respostas, não apaga mensagens e não altera seu estado de leitura.
 */
function ativarMapleHelp() {
  const props = PropertiesService.getScriptProperties();
  if (!/^https:\/\//.test(props.getProperty('MAPLE_HELP_URL') || '')
    || (props.getProperty('GMAIL_WEBHOOK_SECRET') || '').length < 32
    || !props.getProperty('GMAIL_MAILBOX')) throw new Error('Configure as três propriedades do script.');
  if (!props.getProperty('MAPLE_HELP_INICIO')) props.setProperty('MAPLE_HELP_INICIO', new Date().toISOString());
  ['MapleHelp-Importado', 'MapleHelp-Revisar'].forEach(nome => {
    if (!GmailApp.getUserLabelByName(nome)) GmailApp.createLabel(nome);
  });
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'importarMapleHelp')) {
    ScriptApp.newTrigger('importarMapleHelp').timeBased().everyMinutes(1).create();
  }
}

function importarMapleHelp() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const inicio = Date.parse(props.getProperty('MAPLE_HELP_INICIO') || '');
    if (!Number.isFinite(inicio)) throw new Error('Execute ativarMapleHelp primeiro.');
    const mailbox = props.getProperty('GMAIL_MAILBOX').toLowerCase();
    const importado = GmailApp.getUserLabelByName('MapleHelp-Importado');
    const revisar = GmailApp.getUserLabelByName('MapleHelp-Revisar');
    // Gmail aceita epoch em segundos. Não importa o histórico anterior à ativação.
    const threads = GmailApp.search(`in:inbox after:${Math.floor(inicio / 1000)} -label:MapleHelp-Importado -label:MapleHelp-Revisar`, 0, 20);
    let falhas = 0;
    for (const thread of threads) {
      let resultado = 'ok';
      // Só a primeira mensagem abre um chamado; respostas continuam no Gmail.
      const message = thread.getMessages()[0];
      if (message.getDate().getTime() < inicio) { thread.addLabel(importado); continue; }
      const from = message.getFrom();
      const remetente = (from.match(/<([^<>]+)>/)?.[1] || from).trim().toLowerCase();
      if (message.isDraft() || remetente === mailbox) { thread.addLabel(revisar); continue; }
      if (!remetente.endsWith('@maplebeararaxa.com.br')
        || !['', 'no'].includes(message.getHeader('Auto-Submitted').toLowerCase())
        || !autenticadoPeloGoogle(message.getHeader('Authentication-Results'))) {
        thread.addLabel(revisar); continue;
      }
      const original = Utilities.newBlob(message.getRawContent()).getBytes();
      if (original.length > 2500000) { thread.addLabel(revisar); falhas++; continue; }
      const payload = JSON.stringify({
        messageId: message.getId(), mailbox, remetente,
        nome: from.includes('<') ? from.slice(0, from.indexOf('<')).trim().replace(/^"|"$/g, '') : remetente,
        assunto: message.getSubject(), texto: message.getPlainBody(), dataEmail: message.getDate().toISOString(),
        originalBase64: Utilities.base64Encode(original),
      });
      if (Utilities.newBlob(payload).getBytes().length > 3500000) { thread.addLabel(revisar); falhas++; continue; }
      try {
        const response = UrlFetchApp.fetch(`${props.getProperty('MAPLE_HELP_URL').replace(/\/$/, '')}/api/integracoes/gmail`, {
          method: 'post', contentType: 'application/json', payload,
          headers: { Authorization: `Bearer ${props.getProperty('GMAIL_WEBHOOK_SECRET')}` },
          muteHttpExceptions: true, followRedirects: false,
        });
        const codigo = response.getResponseCode();
        if (codigo >= 200 && codigo < 300) {
          const body = JSON.parse(response.getContentText());
          if (!body.id) resultado = 'retentar';
        } else if ([413, 422].includes(codigo)) resultado = 'revisar';
        else resultado = 'retentar';
      } catch { resultado = 'retentar'; }
      if (resultado === 'ok') thread.addLabel(importado);
      else {
        if (resultado === 'revisar') thread.addLabel(revisar);
        falhas++;
      }
    }
    if (falhas) throw new Error(`${falhas} importações pendentes. Confira MapleHelp-Revisar, os prazos de SLA e a configuração da integração.`);
  } finally { lock.releaseLock(); }
}

function autenticadoPeloGoogle(header) {
  // Exige DMARC alinhado ao domínio institucional, informado pelo servidor receptor.
  // Cabeçalho ausente ou inconclusivo segue para revisão; não basta confiar no From.
  const resultado = header.replace(/\r?\n[ \t]+/g, ' ').trim();
  if (!/^mx\.google\.com\s*;/i.test(resultado)) return false;
  const partes = resultado.split(';');
  if (partes.some(p => /\bdmarc=(?!pass\b)\w+/i.test(p))) return false;
  if (partes.some(p => /\bdmarc=pass\b/i.test(p)
    && /\bheader\.from=maplebeararaxa\.com\.br(?:\s|$)/i.test(p))) return true;
  // Workspace pode omitir DMARC: exigir DKIM e SPF alinhados, atestados pelo Google.
  return partes.some(p => /\bdkim=pass\b/i.test(p)
    && /\bheader\.i=@maplebeararaxa\.com\.br(?:\s|$)/i.test(p))
    && partes.some(p => /\bspf=pass\b/i.test(p)
      && /\bsmtp\.mailfrom=[^\s;@]+@maplebeararaxa\.com\.br(?:\s|$)/i.test(p));
}
