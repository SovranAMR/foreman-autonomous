/**
 * FOREMAN — Autonomous Task Queue
 *
 * Foreman'ın kendi başına sürdürebileceği görev kuyruğu.
 * Kullanıcı bir görev verdiğinde, Foreman onu parçalara ayırır
 * ve heartbeat döngüsünde adım adım ilerler.
 *
 * Bu modül LLM çağırmaz — sadece görev state yönetimi yapar.
 * Gerçek iş yapma heartbeat'te action engine üzerinden olur.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const TASK_DIR = '/home/sovranamr/.foreman';
const TASK_FILE = `${TASK_DIR}/task-queue.json`;

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'failed';
export type TaskPriorityLevel = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskStep {
  id: string;
  description: string;
  status: TaskStatus;
  command?: string;        // Shell komutu
  result?: string;         // Sonuç
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retries: number;
  maxRetries: number;
}

export interface AutonomousTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriorityLevel;
  steps: TaskStep[];
  currentStepIndex: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  /** Kullanıcının verdiği ham prompt */
  originalPrompt: string;
  /** Bildirim gönderildi mi */
  notifiedCompletion: boolean;
  /** Toplam harcanan süre (ms) */
  totalTimeMs: number;
}

export interface TaskQueueState {
  tasks: AutonomousTask[];
  completedCount: number;
  failedCount: number;
  lastProcessedAt: number;
}

// ═══════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════

function createEmptyQueue(): TaskQueueState {
  return { tasks: [], completedCount: 0, failedCount: 0, lastProcessedAt: 0 };
}

export async function loadTaskQueue(): Promise<TaskQueueState> {
  try {
    const data = await readFile(TASK_FILE, 'utf-8');
    return { ...createEmptyQueue(), ...JSON.parse(data) };
  } catch {
    return createEmptyQueue();
  }
}

export async function saveTaskQueue(queue: TaskQueueState): Promise<void> {
  if (!existsSync(TASK_DIR)) await mkdir(TASK_DIR, { recursive: true });
  await writeFile(TASK_FILE, JSON.stringify(queue, null, 2));
}

// ═══════════════════════════════════════════
// TASK CREATION
// ═══════════════════════════════════════════

let taskIdCounter = 0;

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++taskIdCounter}`;
}

/**
 * Yeni görev oluştur.
 * steps: Görevin alt adımları. Her adım bir shell komutu olabilir.
 */
export function createTask(
  title: string,
  description: string,
  steps: { description: string; command?: string }[],
  priority: TaskPriorityLevel = 'normal',
  originalPrompt: string = '',
): AutonomousTask {
  return {
    id: genId('task'),
    title,
    description,
    status: 'pending',
    priority,
    steps: steps.map((s, i) => ({
      id: genId('step'),
      description: s.description,
      status: 'pending' as TaskStatus,
      command: s.command,
      retries: 0,
      maxRetries: 3,
    })),
    currentStepIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    originalPrompt,
    notifiedCompletion: false,
    totalTimeMs: 0,
  };
}

// ═══════════════════════════════════════════
// QUEUE OPERATIONS
// ═══════════════════════════════════════════

export function addTask(queue: TaskQueueState, task: AutonomousTask): TaskQueueState {
  return { ...queue, tasks: [...queue.tasks, task] };
}

export function getNextTask(queue: TaskQueueState): AutonomousTask | null {
  // Öncelik sırası: urgent > high > normal > low
  const priorityOrder: TaskPriorityLevel[] = ['urgent', 'high', 'normal', 'low'];

  for (const p of priorityOrder) {
    const task = queue.tasks.find(t => t.status === 'in_progress' && t.priority === p);
    if (task) return task;
  }

  for (const p of priorityOrder) {
    const task = queue.tasks.find(t => t.status === 'pending' && t.priority === p);
    if (task) return task;
  }

  return null;
}

export function getNextStep(task: AutonomousTask): TaskStep | null {
  if (task.currentStepIndex >= task.steps.length) return null;
  const step = task.steps[task.currentStepIndex];
  if (step.status === 'done') {
    task.currentStepIndex++;
    return getNextStep(task);
  }
  return step;
}

/**
 * Adımı tamamla ve sonraki adıma geç
 */
export function completeStep(
  task: AutonomousTask,
  stepId: string,
  result: string,
): AutonomousTask {
  const updated = { ...task, updatedAt: Date.now() };
  const step = updated.steps.find(s => s.id === stepId);
  if (!step) return updated;

  step.status = 'done';
  step.result = result;
  step.completedAt = Date.now();
  if (step.startedAt) {
    updated.totalTimeMs += step.completedAt - step.startedAt;
  }

  // Sonraki adıma geç
  updated.currentStepIndex++;

  // Tüm adımlar bittiyse görevi tamamla
  if (updated.steps.every(s => s.status === 'done')) {
    updated.status = 'done';
    updated.completedAt = Date.now();
  } else {
    updated.status = 'in_progress';
  }

  return updated;
}

/**
 * Adım başarısız oldu
 */
export function failStep(
  task: AutonomousTask,
  stepId: string,
  error: string,
): AutonomousTask {
  const updated = { ...task, updatedAt: Date.now() };
  const step = updated.steps.find(s => s.id === stepId);
  if (!step) return updated;

  step.retries++;
  step.error = error;

  if (step.retries >= step.maxRetries) {
    step.status = 'failed';
    updated.status = 'failed';
  } else {
    step.status = 'pending'; // Retry
  }

  return updated;
}

/**
 * Adımı başlat
 */
export function startStep(task: AutonomousTask, stepId: string): AutonomousTask {
  const updated = { ...task, updatedAt: Date.now(), status: 'in_progress' as TaskStatus };
  const step = updated.steps.find(s => s.id === stepId);
  if (step) {
    step.status = 'in_progress';
    step.startedAt = Date.now();
  }
  return updated;
}

// ═══════════════════════════════════════════
// QUEUE STATS
// ═══════════════════════════════════════════

export interface QueueStats {
  total: number;
  pending: number;
  inProgress: number;
  done: number;
  failed: number;
  blocked: number;
}

export function getQueueStats(queue: TaskQueueState): QueueStats {
  const tasks = queue.tasks;
  return {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
  };
}

/**
 * Tamamlanan görevleri temizle (7 günden eski)
 */
export function cleanupOldTasks(queue: TaskQueueState): TaskQueueState {
  const oneWeekAgo = Date.now() - 7 * 24 * 3600000;
  const kept = queue.tasks.filter(t => {
    if (t.status === 'done' && (t.completedAt ?? 0) < oneWeekAgo) {
      queue.completedCount++;
      return false;
    }
    if (t.status === 'failed' && t.updatedAt < oneWeekAgo) {
      queue.failedCount++;
      return false;
    }
    return true;
  });
  return { ...queue, tasks: kept };
}

/**
 * Kuyruk durumunu insan-okunur formata çevir
 */
export function formatQueueStatus(queue: TaskQueueState): string {
  const stats = getQueueStats(queue);
  if (stats.total === 0) return '📋 Görev kuyruğu boş.';

  const lines = [
    `📋 Görev Kuyruğu: ${stats.total} görev`,
    `  ⏳ Bekleyen: ${stats.pending}`,
    `  🔄 Devam eden: ${stats.inProgress}`,
    `  ✅ Tamamlanan: ${stats.done}`,
  ];

  if (stats.failed > 0) lines.push(`  ❌ Başarısız: ${stats.failed}`);

  // Aktif görevleri listele
  const active = queue.tasks.filter(t => t.status === 'in_progress' || t.status === 'pending');
  for (const t of active.slice(0, 3)) {
    const progress = `${t.steps.filter(s => s.status === 'done').length}/${t.steps.length}`;
    lines.push(`  → ${t.title} [${progress}]`);
  }

  return lines.join('\n');
}
