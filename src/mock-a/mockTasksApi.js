// src/mock-a/mockTasksApi.js

const _tasks = [
  { id: '1', title: 'Buy groceries', completed: false },
  { id: '2', title: 'Walk the dog', completed: true },
  { id: '3', title: 'Finish report', completed: false },
];

const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

const mockTasksApi = {
  getTasks: () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([..._tasks]);
      }, 500);
    });
  },

  getTaskById: (id) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const task = _tasks.find(t => t.id === id);
        if (task) {
          resolve({ ...task });
        } else {
          reject(new Error('Task not found'));
        }
      }, 300);
    });
  },

  addTask: (task) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newTask = { id: generateId(), ...task, completed: false };
        _tasks.push(newTask);
        resolve({ ...newTask });
      }, 300);
    });
  },

  updateTask: (id, updatedFields) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const index = _tasks.findIndex(t => t.id === id);
        if (index !== -1) {
          _tasks[index] = { ..._tasks[index], ...updatedFields };
          resolve({ ..._tasks[index] });
        } else {
          reject(new Error('Task not found'));
        }
      }, 300);
    });
  },

  deleteTask: (id) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const initialLength = _tasks.length;
        _tasks = _tasks.filter(t => t.id !== id);
        if (_tasks.length < initialLength) {
          resolve({ success: true });
        } else {
          reject(new Error('Task not found'));
        }
      }, 300);
    });
  },
};

export default mockTasksApi;
