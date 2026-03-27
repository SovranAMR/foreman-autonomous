const express = require('express');
const app = express();
const port = 3001; // You can change this port as needed

app.use(express.json());

app.get('/tasks', (req, res) => {
  const mockTasks = [
    { id: 1, title: 'Learn about AI', completed: false },
    { id: 2, title: 'Build a mock API', completed: true },
    { id: 3, title: 'Deploy to cloud', completed: false },
  ];
  res.json(mockTasks);
});

app.listen(port, () => {
  console.log(`Mock API listening at http://localhost:${port}`);
});
