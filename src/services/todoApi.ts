import { http } from './api';
import type { Todo } from '../types';

export interface TodoCreateInput {
  title: string;
  description?: string;
  dueDate?: string;
  type?: Todo['type'];
  targetId?: string;
  /** 指派给的 username；不传则默认自己 */
  assignee?: string;
}

export interface TodoUpdateInput {
  title?: string;
  description?: string;
  dueDate?: string;
  completed?: boolean;
  assignee?: string;
}

export const todoApi = {
  list: () => http.get<Todo[]>('/todos'),
  create: (data: TodoCreateInput) => http.post<Todo>('/todos', data),
  update: (id: string, data: TodoUpdateInput) => http.put<Todo>(`/todos/${id}`, data),
  remove: (id: string) => http.delete(`/todos/${id}`),
};
