import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { instrumentation, LANGUAGES } from './plan';

const names = { change: 'x', success: 'y', flag: 'Checkout Button', variant: 'Buy Now', event: 'purchase done' };

describe('instrumentation snippets', () => {
  it.each(['javascript', 'react', 'node'] as const)('%s parses and uses the cleaned names', (language) => {
    const code = instrumentation(names, language);
    const file = LANGUAGES.find((l) => l.id === language)!.file;
    const out = ts.transpileModule(code, { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, allowJs: true } });
    expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
    expect(code).toContain("'checkout_button'");
    expect(code).toContain("'buy_now'");
    expect(code).toContain("'purchase_done'");
  });

  it('python parses', () => {
    const code = instrumentation(names, 'python');
    execFileSync('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], { input: code });
    expect(code).toContain('get_experiment_flag("checkout_button", identifier=user_id)');
  });
});
