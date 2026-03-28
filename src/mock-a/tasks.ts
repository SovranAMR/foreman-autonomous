
import { rest } from 'msw';

const tasks = [
  { id: '1', title: 'Buy milk' },
  { id: '2', title: 'Walk the dog' },
];

export const handlers = [
  rest.get('/api/tasks', (req, res, ctx) => {
    return res(ctx.json(tasks));
  }),
  rest.post('/api/tasks', (req, res, ctx) => {
    const { title } = req.body as { title: string };
    const newTask = { id: (tasks.length + 1).toString(), title };
    tasks.push(newTask);
    return res(ctx.json(newTask));
  }),
];
