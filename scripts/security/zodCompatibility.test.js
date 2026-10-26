/** @jest-environment node */

const { expect, test } = require('@jest/globals');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const projectRoot = process.cwd();
const realRequire = createRequire(join(projectRoot, 'package.json'));
const expoRequire = createRequire(realRequire.resolve('expo/package.json'));
const cliPackage = expoRequire.resolve('@expo/cli/package.json');
const cliRequire = createRequire(cliPackage);
const cliServer = join(dirname(cliPackage), 'build/src/start/server');
const { z } = cliRequire('zod');
const { PluginSchema } = realRequire(join(cliServer, 'DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = realRequire(join(cliServer, 'createMCPDevToolsExtensionSchema.js'));
const { DevToolsPluginCliExtensionResults } = realRequire(join(cliServer, 'DevToolsPluginCliExtensionResults.js'));

const plugin = {
  packageName: 'synthetic-devtools',
  packageRoot: projectRoot,
  cliExtensions: {
    description: 'Synthetic compatibility fixture',
    entryPoint: './synthetic.js',
    commands: [{
      name: 'inspect', title: 'Inspect', environments: ['cli', 'mcp'],
      parameters: [
        { name: 'count', type: 'number' },
        { name: 'approved', type: 'confirm' },
        { name: 'label', type: 'text' },
      ],
    }],
  },
};

test('the CLI-resolved validator rejects bounded oversize before parsing elements', () => {
  let elementsParsed = 0;
  const element = z.preprocess(value => { elementsParsed += 1; return value; }, z.string());
  // 시험용 개수이며 CLI의 운영 입력 상한을 정의하지 않는다.
  const result = z.array(element).max(2).safeParse(Array(1000).fill(0));
  expect(result.success).toBe(false);
  expect(elementsParsed).toBe(0);
  expect(result.error.issues).toEqual([expect.objectContaining({ code: 'too_big' })]);
});

test('the actual CLI plugin schema accepts its supported descriptor', () => {
  expect(PluginSchema.safeParse(plugin).success).toBe(true);
});

test.each(['unknown', ''])('the actual CLI plugin schema rejects environment %p', environment => {
  const invalid = {
    ...plugin,
    cliExtensions: { ...plugin.cliExtensions,
      commands: [{ ...plugin.cliExtensions.commands[0], environments: [environment] }] },
  };
  const result = PluginSchema.safeParse(invalid);
  expect(result.success).toBe(false);
  expect(result.error.issues[0].path).toEqual(['cliExtensions', 'commands', 0, 'environments', 0]);
});

test('the generated CLI command schema preserves primitive parameter types', () => {
  const schema = createMCPDevToolsExtensionSchema(plugin);
  expect(schema.safeParse({ command: 'inspect', count: 2, approved: true, label: 'synthetic' }).success).toBe(true);
  expect(schema.safeParse({ command: 'inspect' }).success).toBe(true);
});

test.each([
  { command: 'unknown' },
  { command: 'inspect', count: '2' },
  { command: 'inspect', approved: 'true' },
  { command: 'inspect', unexpected: true },
])('the generated CLI command schema rejects %p', input => {
  expect(createMCPDevToolsExtensionSchema(plugin).safeParse(input).success).toBe(false);
});

test('the actual CLI output parser preserves valid structured output', () => {
  const results = new DevToolsPluginCliExtensionResults();
  results.append('[{"type":"text","text":"synthetic","level":"info"}]');
  expect(results.getOutput()).toEqual([{ type: 'text', text: 'synthetic', level: 'info' }]);
});

test('the actual CLI output parser reports invalid structured output as an error', () => {
  const results = new DevToolsPluginCliExtensionResults();
  results.append('[{"type":"audio","url":"invalid"}]');
  expect(results.getOutput()).toEqual([
    { type: 'text', text: expect.stringMatching(/^Invalid JSON:/), level: 'error' },
  ]);
});

test('the actual CLI output parser preserves its plain text fallback', () => {
  const results = new DevToolsPluginCliExtensionResults();
  results.append('synthetic\nsecond', 'warning');
  expect(results.getOutput()).toEqual([
    { type: 'text', text: 'synthetic', level: 'warning' },
    { type: 'text', text: 'second', level: 'warning' },
  ]);
});

test('the real ESLint config preserves hook and compiler diagnostics', () => {
  // ESLint의 native config 로더를 별도 Node 프로세스에서 그대로 실행한다.
  const script = `
    const { ESLint } = require('eslint');
    (async () => {
      const lint = new ESLint();
      const sources = [
        "import { useState } from 'react'; export function Probe() { useState(0); return null; }",
        "import { useState } from 'react'; export function Probe({ enabled }) { if (enabled) useState(0); return null; }",
        "export function Probe({ value }) { value.count = 1; return <div />; }",
      ];
      const diagnostics = [];
      for (const source of sources) {
        const [result] = await lint.lintText(source, { filePath: 'src/SyntheticHooksProbe.tsx' });
        diagnostics.push(result.messages.map(message => message.ruleId));
      }
      process.stdout.write(JSON.stringify(diagnostics));
    })().catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
  `;
  const diagnostics = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd: projectRoot, timeout: 15000, encoding: 'utf8',
    env: { ...process.env, EXPO_NO_DOTENV: '1' },
  }));
  expect(diagnostics[0]).not.toContain('react-hooks/rules-of-hooks');
  expect(diagnostics[1]).toContain('react-hooks/rules-of-hooks');
  expect(diagnostics[2]).toContain('react-hooks/immutability');
}, 20000);
