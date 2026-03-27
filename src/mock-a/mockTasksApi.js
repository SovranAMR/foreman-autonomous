// src/mock-a/mockTasksApi.js

let tasks = [
  { id: '1', title: 'Buy groceries', completed: false },
  { id: '2', title: 'Walk the dog', completed: true },
  { id: '3', title: 'Finish report', completed: false },
];

const getTasks = () => {
  return Promise.resolve(tasks);
};

const getTaskById = (id) => {
  return Promise.resolve(tasks.find(task => task.id === id));
};

const addTask = (title, description) => {
  const newTask = {
    id: String(tasks.length + 1), // Simple ID generation
    title,
    description,
    completed: false,
  };
  tasks.push(newTask);
  return Promise.resolve(newTask);
};

const updateTask = (id, updates) => {
  const taskIndex = tasks.findIndex(task => task.id === id);
  if (taskIndex === -1) {
    return Promise.resolve(undefined);
  }
  tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
  return Promise.resolve(tasks[taskIndex]);
};

const deleteTask = (id) => {
  const initialLength = tasks.length;
  tasks = tasks.filter(task => task.id !== id);
  return Promise.resolve(tasks.length < initialLength);
};

exports.default = { // Export as default for require('./mockTasksApi').default;
  getTasks,
  getTaskById,
  addTask,
  updateTask,
  deleteTask,
};