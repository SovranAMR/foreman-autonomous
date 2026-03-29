
import { json, TysInstance } from 'tys';

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

let tasks: Task[] = [
  { id: 1, title: 'Learn Foreman', completed: true },
  { id: 2, title: 'Build an App', completed: false },
  { id: 3, title: 'Deploy to Production', completed: false },
];

export default function(app: TysInstance) {
  app.get('/tasks', () => {
    return json(tasks);
  });

  app.post('/tasks', async (req) => {
    try {
      const { title } = await req.json();
      if (!title) {
        return json({ error: 'Title is required' }, { status: 400 });
      }
      const newTask: Task = {
        id: tasks.length + 1,
        title,
        completed: false,
      };
      tasks.push(newTask);
      return json(newTask, { status: 201 });
    } catch (error) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }
  });

  app.get('/tasks/:id', (req) => {
    const id = parseInt(req.param('id'), 10);
    const task = tasks.find(t => t.id === id);
    if (task) {
      return json(task);
    }
    return json({ error: 'Task not found' }, { status: 404 });
  });

  app.put('/tasks/:id', async (req) => {
    const id = parseInt(req.param('id'), 10);
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      return json({ error: 'Task not found' }, { status: 404 });
    }

    try {
      const { title, completed } = await req.json();
      if (title !== undefined) {
        tasks[taskIndex].title = title;
      }
      if (completed !== undefined) {
        tasks[taskIndex].completed = completed;
      }
      return json(tasks[taskIndex]);
    } catch (error) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }
  });

  app.delete('/tasks/:id', (req) => {
    const id = parseInt(req.param('id'), 10);
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      return json({ error: 'Task not found' }, { status: 404 });
    }
    tasks.splice(taskIndex, 1);
    return new Response(null, { status: 204 });
  });
}
