const express = require('express');

const mockApi = require('./mockTasksApi').default;

const app = express();
const port = 3001; // You can change this port as needed

app.use(express.json());

// Initialize some dummy tasks for demonstration
mockApi.addTask({ title: 'Learn about AI', description: 'Understand the basics of Artificial Intelligence.' });
mockApi.addTask({ title: 'Build a mock API', description: 'Develop a mock REST API for task management.' });
mockApi.addTask({ title: 'Deploy to cloud', description: 'Deploy the application to a cloud platform like AWS or GCP.' });

// GET all tasks
app.get('/tasks', async (req, res) => {
  const tasks = await mockApi.getTasks();
  res.json(tasks);
});

// GET task by ID
app.get('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const task = await mockApi.getTaskById(id);
  if (task) {
    res.json(task);
  } else {
    res.status(404).send('Task not found');
  }
});

// POST a new task
app.post('/tasks', async (req, res) => {
  const { title, description } = req.body;
  if (!title) {
    return res.status(400).send('Title is required');
  }
  const newTask = await mockApi.addTask({ title, description: description || '' });
  res.status(201).json(newTask);
});

// PUT update a task
app.put('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updatedTask = await mockApi.updateTask(id, updates);
  if (updatedTask) {
    res.json(updatedTask);
  } else {
    res.status(404).send('Task not found');
  }
});

// DELETE a task
app.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const deleted = await mockApi.deleteTask(id);
  if (deleted) {
    res.status(204).send(); // No Content
  } else {
    res.status(404).send('Task not found');
  }
});

app.listen(port, () => {
  console.log(`Mock API listening at http://localhost:${port}`);
});
