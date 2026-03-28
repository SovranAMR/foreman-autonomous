
import { rest } from 'msw';

const tasks = [
  { id: '1', title: 'Buy milk', completed: false },
  { id: '2', title: 'Walk the dog', completed: true },
  { id: '3', title: 'Do laundry', completed: false },
];

export const handlers = [
  rest.get('/api/tasks', (req, res, ctx) => {
    return res(ctx.json(tasks));
  }),

  rest.post('/api/tasks', async (req, res, ctx) => {
    const { title } = await req.json();
    const newTask = { id: String(tasks.length + 1), title, completed: false };
    tasks.push(newTask);
    return res(ctx.json(newTask), ctx.status(201));
  }),
];
