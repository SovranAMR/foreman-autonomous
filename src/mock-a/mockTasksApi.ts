// src/mock-a/mockTasksApi.ts

interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
}

let tasks: Task[] = [
  { id: '1', title: 'Buy groceries', completed: false },
  { id: '2', title: 'Walk the dog', completed: true },
  { id: '3', title: 'Finish report', completed: false },
];

const getTasks = (): Promise<Task[]> => {
  return Promise.resolve(tasks);
};

const getTaskById = (id: string): Promise<Task | undefined> => {
  return Promise.resolve(tasks.find(task => task.id === id));
};

const addTask = (title: string, description?: string): Promise<Task> => { // Renamed from createTask
  const newTask: Task = {
    id: String(tasks.length + 1), // Simple ID generation
    title,
    description,
    completed: false,
  };
  tasks.push(newTask);
  return Promise.resolve(newTask);
};

const updateTask = (id: string, updates: Partial<Task>): Promise<Task | undefined> => {
  const taskIndex = tasks.findIndex(task => task.id === id);
  if (taskIndex === -1) {
    return Promise.resolve(undefined);
  }
  tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
  return Promise.resolve(tasks[taskIndex]);
};

const deleteTask = (id: string): Promise<boolean> => {
  const initialLength = tasks.length;
  tasks = tasks.filter(task => task.id !== id);
  return Promise.resolve(tasks.length < initialLength);
};

export const mockApi = { // Export as a single object
  getTasks,
  getTaskById,
  addTask, // Export renamed function
  updateTask,
  deleteTask,
};
