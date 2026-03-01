import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { extractOperations, isDangerousCommand } from './worker-executor.js';
import { WorkerProtocol } from './types.js';

describe('WorkerExecutor Robustness', () => {
  const mockProtocol = (decide: string, execute: string): WorkerProtocol => ({
    step1_read: 'read',
    step2_context: 'context',
    step3_impact: 'impact',
    step4_decide: decide,
    step5_predict: 'predict',
    step6_execute: execute,
    step7_verify: 'verify',
    step8_report: 'report'
  });

  describe('extractOperations Edge Cases', () => {
    it('should NOT extract from step7_verify (verify commands are not real operations)', () => {
      const protocol = mockProtocol('', 'No commands here');
      protocol.step7_verify = 'Testing the fix:\n```bash\nnpx tsx src/main.ts\n```';
      
      const ops = extractOperations(protocol);
      // step7_verify commands should be excluded — they are verification, not execution
      assert.ok(!ops.some(op => op.type === 'run_command' && op.command === 'npx tsx src/main.ts'));
    });

    it('should extract unlabeled code blocks with $ prefix as commands', () => {
      const protocol = mockProtocol('', 'Run this:\n```\n$ ls -la\n$ pwd\n```');
      const ops = extractOperations(protocol);
      
      const commands = ops.filter(op => op.type === 'run_command').map(op => op.command);
      assert.deepStrictEqual(commands, ['ls -la', 'pwd']);
    });

    it('should handle "Create file `path`" pattern (backticks)', () => {
      const protocol = mockProtocol('', 'Create file `src/test.txt`:\n```\nhello world\n```');
      const ops = extractOperations(protocol);
      
      assert.strictEqual(ops[0].type, 'write_file');
      assert.strictEqual(ops[0].path, 'src/test.txt');
      assert.strictEqual(ops[0].content, 'hello world');
    });

    it('should skip file write commands like cat > to avoid duplicates', () => {
      const protocol = mockProtocol('', '```bash\ncat > test.txt <<EOF\ncontent\nEOF\nls\n```');
      const ops = extractOperations(protocol);
      
      const commands = ops.filter(op => op.type === 'run_command').map(op => op.command);
      assert.ok(!commands.includes('cat > test.txt <<EOF'));
      assert.ok(commands.includes('ls'));
    });
  });

  describe('Security Guardrails', () => {
    it('should identify dangerous commands correctly', () => {
      assert.strictEqual(isDangerousCommand('rm -rf /'), true);
      assert.strictEqual(isDangerousCommand('sudo apt update'), true);
      assert.strictEqual(isDangerousCommand('git push origin main --force'), true);
      assert.strictEqual(isDangerousCommand('ls -la'), false);
      assert.strictEqual(isDangerousCommand('npm install'), false);
    });

    it('should refuse to extract dangerous commands', () => {
      const protocol = mockProtocol('', '```bash\nsudo rm -rf /\nls\n```');
      const ops = extractOperations(protocol);
      
      const commands = ops.filter(op => op.type === 'run_command').map(op => op.command);
      assert.strictEqual(commands.length, 1);
      assert.strictEqual(commands[0], 'ls');
    });
  });
});
