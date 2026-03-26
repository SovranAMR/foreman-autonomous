
// src/mock-a/index.ts

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: string;
}

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Buy groceries',
    description: 'Milk, eggs, bread, fruits',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Walk the dog',
    description: 'Take Fido to the park',
    completed: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
  },
  {
    id: '3',
    title: 'Finish report',
    description: 'Complete the quarterly sales report',
    completed: false,
    createdAt: new Date().toISOString(),
  },
];

export const getTasks = (): Promise<Task[]> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockTasks), 500); // Simulate network delay
  });
};

export const getTaskById = (id: string): Promise<Task | undefined> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockTasks.find(task => task.id === id)), 300);
  });
};

export const addTask = (title: string, description?: string): Promise<Task> => {
  return new Promise((resolve) => {
    const newTask: Task = {
      id: String(mockTasks.length + 1),
      title,
      description,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    mockTasks.push(newTask);
    setTimeout(() => resolve(newTask), 200);
  });
};

export const updateTask = (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | undefined> => {
  return new Promise((resolve) => {
    const taskIndex = mockTasks.findIndex(task => task.id === id);
    if (taskIndex > -1) {
      mockTasks[taskIndex] = { ...mockTasks[taskIndex], ...updates };
      setTimeout(() => resolve(mockTasks[taskIndex]), 200);
    } else {
      setTimeout(() => resolve(undefined), 200);
    }
  });
};

export const deleteTask = (id: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const initialLength = mockTasks.length;
    // Filter out the task, reassign mockTasks to the new array
    const updatedTasks = mockTasks.filter(task => task.id !== id);
    // If the task was found and removed, lengths will differ
    if (updatedTasks.length < initialLength) {
        // Update mockTasks with the new array
        mockTasks.splice(0, mockTasks.length, ...updatedTasks);
        setTimeout(() => resolve(true), 200);
    } else {
        setTimeout(() => resolve(false), 200);
    }
  });
};

