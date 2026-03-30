
import { ITask } from '../types';

export const mockTasks: ITask[] = [
  {
    id: 'TASK-1',
    title: 'Implement the core engine',
    status: 'completed',
    priority: 'high',
    assignee: 'ali-ilcel',
  },
  {
    id: 'TASK-2',
    title: 'Design the UI/UX for the new dashboard',
    status: 'in-progress',
    priority: 'high',
    assignee: 'sen-foreman',
  },
  {
    id: 'TASK-3',
    title: 'Fix bug #123 in the authentication flow',
    status: 'todo',
    priority: 'medium',
    assignee: null,
  },
  {
    id: 'TASK-4',
    title: 'Write documentation for the new API',
    status: 'todo',
    priority: 'low',
    assignee: null,
  },
];

export const getMockTasks = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTasks);
    }, 500);
  });
};
