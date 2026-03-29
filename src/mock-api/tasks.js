
const tasks = [
  { id: 1, title: 'Learn Foreman', completed: true },
  { id: 2, title: 'Build an awesome app', completed: false },
  { id: 3, title: 'Deploy to production', completed: false },
];

// Mock API endpoint for getting tasks
function getTasks() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(tasks);
    }, 500);
  });
}

module.exports = { getTasks };
