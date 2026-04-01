
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Define the Task interface
export interface Task {
  id: number;
  title: string;
  completed: boolean;
}

// Function to persist tasks to JSON file
const saveTasks = (tasks: Task[]) => {
  try {
    const filePath = join(__dirname, 'tasks.json');
    writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving mock tasks:', error);
  }
};

// Load mock tasks from JSON file
const loadTasks = (): Task[] => {
  try {
    const filePath = join(__dirname, 'tasks.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    // If the file doesn't exist or is invalid, start with an empty array
    return [];
  }
};

let tasks: Task[] = loadTasks();

export const getTasks = (): Task[] => {
  return tasks;
};

export const addTask = (task: Omit<Task, 'id'>): Task => {
  const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
  const newTask: Task = { ...task, id: newId };
  tasks.push(newTask);
  saveTasks(tasks);
  return newTask;
};

export const getTask = (id: number): Task | undefined => {
    return tasks.find((task) => task.id === id);
};

export const updateTask = (id: number, updatedTask: Partial<Task>): Task | null => {
    const taskIndex = tasks.findIndex((task) => task.id === id);
    if (taskIndex > -1) {
        tasks[taskIndex] = { ...tasks[taskIndex], ...updatedTask };
        saveTasks(tasks);
        return tasks[taskIndex];
    }
    return null;
};

export const deleteTask = (id: number): Task | null => {
    const taskIndex = tasks.findIndex((task) => task.id === id);
    if (taskIndex > -1) {
        const [deletedTask] = tasks.splice(taskIndex, 1);
        saveTasks(tasks);
        return deletedTask;
    }
    return null;
};
