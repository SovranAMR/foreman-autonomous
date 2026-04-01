const tasks = [
  { id: 1, title: 'Visioner: Write a mock API for tasks in src/mock-a', status: 'completed' },
  { id: 2, title: 'Visioner: Create a simple index.html file with hel', status: 'completed' },
  { id: 3, title: 'Refactor: Simplify index.html structure', status: 'completed' },
  { id: 4, title: 'Chore: Clean and simplify index.html', status: 'completed' },
  { id: 5, title: 'New Feature: Implement user authentication', status: 'in-progress' },
  { id: 6, title: 'Bug: Fix layout issue on mobile devices', status: 'open' },
];

export default function handler(req, res) {
  res.status(200).json(tasks);
}
