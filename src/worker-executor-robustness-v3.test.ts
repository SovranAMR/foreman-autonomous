import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { extractOperations, isDangerousCommand } from './worker-executor.js';
import { WorkerProtocol } from './types.js';

describe('Worker Executor Robustness (Extraction)', () => {
  const emptyProtocol: WorkerProtocol = {
    step1_analyze: '',
    step2_context: '',
    step3_plan: '',
    step4_decide: '',
    step5_validate: '',
    step6_execute: '',
    step7_verify: '',
    step8_finalize: ''
  };

  it('should extract file write with "Path:" marker', () => {
    const protocol = { ...emptyProtocol, step6_execute: '```typescript\n// Path: src/test.ts\nconsole.log("hello");\n```' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'write_file');
    assert.strictEqual(ops[0].path, 'src/test.ts');
    assert.strictEqual(ops[0].content, 'console.log("hello");');
  });

  it('should extract file write with "Write to:" marker', () => {
    const protocol = { ...emptyProtocol, step6_execute: '```typescript\n// Write to: src/test.ts\nconsole.log("hello");\n```' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].path, 'src/test.ts');
  });

  it('should extract file write with "Write to `path`:" prefix', () => {
    const protocol = { ...emptyProtocol, step6_execute: 'Write to `src/app.js`:\n```javascript\nconst x = 1;\n```' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'write_file');
    assert.strictEqual(ops[0].path, 'src/app.js');
    assert.strictEqual(ops[0].content, 'const x = 1;');
  });

  it('should extract edit operations', () => {
    const protocol = { 
      ...emptyProtocol, 
      step6_execute: 'Edit `src/main.ts`:\n```typescript\nold code\n```\n→\n```typescript\nnew code\n```' 
    };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'edit_file');
    assert.strictEqual(ops[0].path, 'src/main.ts');
    assert.strictEqual(ops[0].oldText, 'old code');
    assert.strictEqual(ops[0].newText, 'new code');
  });

  it('should extract bash commands from blocks', () => {
    const protocol = { ...emptyProtocol, step6_execute: '```bash\nnpm install\n$ npm test\n```' };
    const ops = extractOperations(protocol);
    // npm install and npm test
    const commands = ops.filter(o => o.type === 'run_command').map(o => o.command);
    assert.ok(commands.includes('npm install'));
    assert.ok(commands.includes('npm test'));
  });

  it('should extract inline commands from step6_execute', () => {
    const protocol = { ...emptyProtocol, step6_execute: '$ ls -la\n$ echo "done"' };
    const ops = extractOperations(protocol);
    const commands = ops.filter(o => o.type === 'run_command').map(o => o.command);
    assert.ok(commands.includes('ls -la'));
    assert.ok(commands.includes('echo "done"'));
  });

  it('should block dangerous commands during extraction', () => {
    const protocol = { ...emptyProtocol, step6_execute: '$ rm -rf /\n$ sudo apt-get update' };
    const ops = extractOperations(protocol);
    const commands = ops.filter(o => o.type === 'run_command');
    assert.strictEqual(commands.length, 0, 'Dangerous commands should not be extracted');
  });

  it('should extract rename operations', () => {
    const protocol = { ...emptyProtocol, step6_execute: 'Move `old.ts` to `new.ts`' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'rename_node');
    assert.strictEqual(ops[0].path, 'old.ts');
    assert.strictEqual(ops[0].newPath, 'new.ts');
  });

  it('should detect dangerous commands correctly', () => {
    assert.strictEqual(isDangerousCommand('rm -rf /'), true);
    assert.strictEqual(isDangerousCommand('sudo ls'), true);
    assert.strictEqual(isDangerousCommand('npm publish'), true);
    assert.strictEqual(isDangerousCommand('python -c "import socket;..."'), true);
    assert.strictEqual(isDangerousCommand('ls -la'), false);
    assert.strictEqual(isDangerousCommand('git commit -m "feat"'), false);
  });

  it('should extract directory creation', () => {
    const protocol = { ...emptyProtocol, step6_execute: 'Create directory `src/new-feature`' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'create_dir');
    assert.strictEqual(ops[0].path, 'src/new-feature');
  });

  it('should extract delete operations', () => {
    const protocol = { ...emptyProtocol, step6_execute: 'Remove file `obsolete.ts`' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'delete_file');
    assert.strictEqual(ops[0].path, 'obsolete.ts');
  });

  it('should handle fallback code fence with filename-like first line', () => {
    const protocol = { ...emptyProtocol, step6_execute: '```tsx\nsrc/components/Button.tsx\nexport const Button = () => <button />;\n```' };
    const ops = extractOperations(protocol);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].type, 'write_file');
    assert.strictEqual(ops[0].path, 'src/components/Button.tsx');
    assert.strictEqual(ops[0].content, 'export const Button = () => <button />;');
  });
});
