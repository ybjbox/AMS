/**
 * 待办 CRUD API — 数据归属按 username 隔离，支持跨设备同步与协作派单（P2-7）。
 * 路由挂在 /api/todos，位于 authGate 之后，req.auth 一定存在。
 */
import { Router, json } from 'express';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type TodoType,
} from './todosDb.ts';
import { ROLE_LEVEL, type SystemRole } from './authDb.ts';
import { validateBody, todoCreateSchema, todoUpdateSchema, errMessage } from './validation.ts';

export const todosRouter = Router();
todosRouter.use(json());

const isPrivileged = (role: SystemRole) => ROLE_LEVEL[role] >= ROLE_LEVEL.HR;

todosRouter.get('/', (req, res) => {
  res.json(listTodos(req.auth!.username));
});

todosRouter.post('/', validateBody(todoCreateSchema), (req, res) => {
  try {
    const todo = createTodo({
      ...req.body,
      createdBy: req.auth!.username,
    });
    res.status(201).json(todo);
  } catch (error) {
    res.status(400).json({ error: errMessage(error) });
  }
});

todosRouter.put('/:id', validateBody(todoUpdateSchema), (req, res) => {
  const updated = updateTodo(
    req.params.id,
    req.body || {},
    req.auth!.username,
    isPrivileged(req.auth!.systemRole)
  );
  if (updated === null) {
    return res.status(404).json({ error: 'Todo not found or no permission' });
  }
  res.json(updated);
});

todosRouter.delete('/:id', (req, res) => {
  const ok = deleteTodo(req.params.id, req.auth!.username, isPrivileged(req.auth!.systemRole));
  if (!ok) return res.status(404).json({ error: 'Todo not found or no permission' });
  res.json({ success: true });
});
