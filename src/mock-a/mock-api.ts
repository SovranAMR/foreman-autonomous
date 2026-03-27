// src/mock-a/mock-api.ts

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

let tasks: Task[] = [];
let nextId = 1;

export const mockApi = {
  getTasks(): Promise<Task[]> {
    return Promise.resolve(tasks);
  },

  getTaskById(id: string): Promise<Task | undefined> {
    return Promise.resolve(tasks.find(task => task.id === id));
  },

  addTask(title: string, description: string): Promise<Task> {
    const newTask: Task = {
      id: (nextId++).toString(),
      title,
      description,
      completed: false,
    };
    tasks.push(newTask);
    return Promise.resolve(newTask);
  },

  updateTask(id: string, updates: Partial<Omit<Task, 'id'>>): Promise<Task | undefined> {
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) {
      return Promise.resolve(undefined);
    }
    tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
    return Promise.resolve(tasks[taskIndex]);
  },

  deleteTask(id: string): Promise<boolean> {
    const initialLength = tasks.length;
    tasks = tasks.filter(task => task.id !== id);
    return Promise.resolve(tasks.length < initialLength);
  },

  // Reset for testing purposes
  _reset(): void {
    tasks = [];
    nextId = 1;
  }
};
