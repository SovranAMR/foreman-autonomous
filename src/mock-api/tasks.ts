export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
}

let tasks: Task[] = [
  { id: '1', title: 'Setup project', description: 'Initialize project structure and dependencies.', status: 'done' },
  { id: '2', title: 'Create UI mockups', description: 'Design the main user interface components.', status: 'in-progress' },
  { id: '3', title: 'Develop API endpoints', description: 'Implement the core API logic.', status: 'todo' },
];

export const getTasks = async (): Promise<Task[]> => {
  return Promise.resolve(tasks);
};

export const getTask = async (id: string): Promise<Task | undefined> => {
  return Promise.resolve(tasks.find(task => task.id === id));
};

export const createTask = async (task: Omit<Task, 'id'>): Promise<Task> => {
  const newTask: Task = {
    id: (tasks.length + 1).toString(),
    ...task,
  };
  tasks.push(newTask);
  return Promise.resolve(newTask);
};

export const updateTask = async (id: string, updates: Partial<Task>): Promise<Task | undefined> => {
  const taskIndex = tasks.findIndex(task => task.id === id);
  if (taskIndex === -1) {
    return undefined;
  }
  tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
  return Promise.resolve(tasks[taskIndex]);
};

export const deleteTask = async (id: string): Promise<boolean> => {
  const initialLength = tasks.length;
  tasks = tasks.filter(task => task.id !== id);
  return Promise.resolve(tasks.length < initialLength);
};
