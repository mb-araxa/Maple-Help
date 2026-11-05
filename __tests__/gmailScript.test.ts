// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = readFileSync(new URL('../integrations/gmail/MapleHelp.gs', import.meta.url), 'utf8');
const autenticado = (header: string) => runInNewContext(`${script}\nautenticadoPeloGoogle(header);`, { header });
describe('Autenticação do remetente no script Gmail', () => {
  it('aceita somente resultado Google com DMARC alinhado ao domínio institucional', () => {
    expect(autenticado('mx.google.com; dkim=pass; dmarc=pass (p=REJECT) header.from=maplebeararaxa.com.br')).toBe(true);
    expect(autenticado('mx.google.com; dmarc=pass header.from=maplebeararaxa.com.br.evil.test')).toBe(false);
    expect(autenticado('outro.servidor; dmarc=pass header.from=maplebeararaxa.com.br')).toBe(false);
    expect(autenticado('mx.google.com; spf=pass; dmarc=fail header.from=maplebeararaxa.com.br')).toBe(false);
    expect(autenticado('')).toBe(false);
  });
});
