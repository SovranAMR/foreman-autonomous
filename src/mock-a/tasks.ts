
export interface Task {
  id: string;
  title: string;
  completed: boolean;
}

const tasks: Task[] = [
  { id: '1', title: 'Set up project', completed: true },
  { id: '2', title: 'Create mock API', completed: false },
  { id: '3', title: 'Integrate with frontend', completed: false },
];

export const getTasks = (): Promise<Task[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(tasks);
    }, 500);
  });
};

export const addTask = (title: string): Promise<Task> => {
  return new Promise((resolve) => {
    const newTask: Task = {
      id: String(tasks.length + 1),
      title,
      completed: false,
    };
    tasks.push(newTask);
    setTimeout(() => {
      resolve(newTask);
    }, 500);
  });
};

export const updateTask = (id: string, updates: Partial<Task>): Promise<Task | null> => {
  return new Promise((resolve) => {
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex !== -1) {
      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      setTimeout(() => {
        resolve(tasks[taskIndex]);
      }, 500);
    } else {
      setTimeout(() => {
        resolve(null);
      }, 500);
    }
  });
};

export const deleteTask = (id: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex !== -1) {
      tasks.splice(taskIndex, 1);
      setTimeout(() => {
        resolve(true);
      }, 500);
    } else {
      setTimeout(() => {
        resolve(false);
      }, 500);
    }
  });
};
