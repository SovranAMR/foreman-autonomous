
export interface Task {
  id: string;
  title: string;
  completed: boolean;
}

const tasks: Task[] = [
  { id: '1', title: 'Setup project structure', completed: true },
  { id: '2', title: 'Create mock API', completed: true },
  { id: '3', title: 'Integrate API with frontend', completed: false },
  { id: '4', title: 'Add styling', completed: false },
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
            id: String(Date.now()),
            title,
            completed: false,
        };
        tasks.push(newTask);
        setTimeout(() => {
            resolve(newTask);
        }, 500);
    });
};
