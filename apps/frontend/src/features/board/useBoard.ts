import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';
import type { CardPriority } from './priority';

// Espejo de BoardView / CardDetail del backend (projects.service.ts / cards.service.ts).
export interface BoardCard {
  id: string;
  code: string;
  title: string;
  priority: CardPriority | null;
  dueDate: string | null;
  dueState: 'overdue' | 'soon' | null;
  completed: boolean;
  storyPoints: number | null;
  assignees: { id: string; name: string }[];
  /// Código de la tarjeta madre si esta es una subtarea; null si no.
  parentCode: string | null;
  /// Solo en un contenedor (tarjeta dividida): cuántas subtareas tiene y cuántas están hechas.
  subtasks: { total: number; done: number } | null;
}

export interface BoardColumn {
  id: string;
  name: string;
  /// La última columna es "hecho".
  isDone: boolean;
  cards: BoardCard[];
}

export interface BoardView {
  project: { id: string; key: string; name: string; color: string };
  boardId: string;
  canEdit: boolean;
  canManage: boolean;
  columns: BoardColumn[];
}

export interface CardDetail {
  id: string;
  code: string;
  number: number;
  title: string;
  description: string | null;
  priority: CardPriority | null;
  dueDate: string | null;
  dueState: 'overdue' | 'soon' | null;
  progress: number;
  storyPoints: number | null;
  /// Por qué se dejó en 13 en vez de dividirla; null si no aplica.
  effortNote: string | null;
  completed: boolean;
  createdAt: string;
  column: { id: string; name: string };
  columns: { id: string; name: string }[];
  project: { id: string; key: string; name: string; color: string };
  assignees: { id: string; name: string }[];
  members: { id: string; name: string }[];
  canEdit: boolean;
  /// Dividida en subtareas: no tiene esfuerzo, prioridad, asignados ni avance propios;
  /// su avance y su columna se derivan de las hijas.
  isContainer: boolean;
  /// Si es una subtarea, de quién.
  parent: { id: string; code: string; title: string } | null;
  subtasks: {
    id: string;
    code: string;
    title: string;
    progress: number;
    completed: boolean;
    storyPoints: number | null;
    column: string;
    assignees: { id: string; name: string }[];
  }[];
  /// Hoja abierta de primer nivel, y quien mira puede editar.
  canDivide: boolean;
}

// Todo lo que cuelga de ['projects'] (tablero, detalle, stats, actividad, grilla)
// y del Dashboard cambia cuando se toca una tarjeta o una columna: un mismo
// número se recalcula en todas las pantallas, no solo en la que se editó.
function refreshAfterBoardChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['projects'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['cards'] });
}

export const boardKey = (projectId: string) => ['projects', 'board', projectId] as const;

export function useBoard(projectId: string) {
  return useQuery({
    queryKey: boardKey(projectId),
    queryFn: () => apiFetch<BoardView>(`/projects/${projectId}/board`),
  });
}

/// Mueve `cardId` a `columnId` en el índice `position` (sin él, al final), igual
/// que el servidor: el índice cuenta las demás tarjetas de la columna destino.
export function applyMove(board: BoardView, cardId: string, columnId: string, position?: number): BoardView {
  const source = board.columns.find((c) => c.cards.some((card) => card.id === cardId));
  const card = source?.cards.find((c) => c.id === cardId);
  const target = board.columns.find((c) => c.id === columnId);
  if (!source || !card || !target) return board;

  const moved = source.id === target.id ? card : { ...card, completed: target.isDone };
  return {
    ...board,
    columns: board.columns.map((column) => {
      const without = column.cards.filter((c) => c.id !== cardId);
      if (column.id !== target.id) return { ...column, cards: without };
      const index = position === undefined ? without.length : Math.min(Math.max(position, 0), without.length);
      return { ...column, cards: [...without.slice(0, index), moved, ...without.slice(index)] };
    }),
  };
}

export function useMoveCard(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, columnId, position }: { cardId: string; columnId: string; position?: number }) =>
      apiFetch(`/cards/${cardId}/move`, { method: 'PATCH', body: JSON.stringify({ columnId, position }) }),
    // Optimista: la tarjeta aparece en su lugar al soltarla; si el servidor la
    // rechaza, vuelve a donde estaba.
    onMutate: async ({ cardId, columnId, position }) => {
      await queryClient.cancelQueries({ queryKey: boardKey(projectId) });
      const previous = queryClient.getQueryData<BoardView>(boardKey(projectId));
      if (previous) queryClient.setQueryData(boardKey(projectId), applyMove(previous, cardId, columnId, position));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey(projectId), context.previous);
    },
    onSettled: () => refreshAfterBoardChange(queryClient),
  });
}

export function useCreateCard(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, columnId }: { title: string; columnId: string }) =>
      apiFetch<{ id: string; code: string }>(`/boards/${boardId}/cards`, {
        method: 'POST',
        body: JSON.stringify({ title, columnId }),
      }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

export function useAddColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify({ name }) }),
    // Agregar una columna cambia cuál es la última ("hecho"): las tarjetas
    // cerradas de la anterior se reabren en el servidor, así que se refresca todo.
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

// ── Detalle de tarjeta ───────────────────────────────────────────────────

export function useCardDetail(cardId: string | null) {
  return useQuery({
    queryKey: ['cards', 'detail', cardId],
    queryFn: () => apiFetch<CardDetail>(`/cards/${cardId}`),
    enabled: !!cardId,
  });
}

export function useUpdateCard(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; description?: string | null }) =>
      apiFetch(`/cards/${cardId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

export function useSetPriority(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (priority: CardPriority | null) =>
      apiFetch(`/cards/${cardId}/priority`, { method: 'PATCH', body: JSON.stringify({ priority }) }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

export function useAssignees(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, assign }: { userId: string; assign: boolean }) =>
      apiFetch(`/cards/${cardId}/assignees/${userId}`, { method: assign ? 'POST' : 'DELETE' }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

// ── Avance y esfuerzo ────────────────────────────────────────────────────

/// Etapa de avance (0/25/50/75/100). Llegar a 100 mueve la tarjeta a la última
/// columna y la cierra; bajar de 100 la saca de ahí (invariante de BACKEND.md
/// §2, la aplica el servidor): por eso se refresca todo el detalle y el tablero.
export function useSetProgress(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (progress: number) =>
      apiFetch(`/cards/${cardId}/progress`, { method: 'PATCH', body: JSON.stringify({ progress }) }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

/// Esfuerzo (1/2/3/5/8/13 o null). `note` es la justificación de dejar en 13;
/// sin `note` el servidor no la toca.
export function useSetStoryPoints(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyPoints, note }: { storyPoints: number | null; note?: string | null }) =>
      apiFetch(`/cards/${cardId}/story-points`, { method: 'PATCH', body: JSON.stringify({ storyPoints, note }) }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

/// Divide la tarjeta en subtareas (mínimo 2, máximo MAX_SUBTASKS). La original
/// pasa a ser un contenedor: deja de contar en las métricas y cuentan las hijas,
/// así que se refresca todo (tablero, resumen, dashboard).
export const MAX_SUBTASKS = 12;

export function useDivideCard(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subtasks: { title: string; storyPoints: number | null }[]) =>
      apiFetch<{ id: string; subtasks: { id: string; code: string; title: string }[] }>(`/cards/${cardId}/divide`, {
        method: 'POST',
        body: JSON.stringify({ subtasks }),
      }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

// ── Adjuntos ─────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
}

/// Mismo tope que el servidor (card-attachments.controller.ts). Se chequea acá
/// también para avisar antes de subir 20 MB para nada.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function useAttachments(cardId: string) {
  return useQuery({
    queryKey: ['cards', 'attachments', cardId],
    queryFn: () => apiFetch<Attachment[]>(`/cards/${cardId}/attachments`),
  });
}

export function useUploadAttachment(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiFetch<Attachment>(`/cards/${cardId}/attachments`, { method: 'POST', body: form });
    },
    // También refresca la actividad ("adjuntó …") de las demás pantallas.
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

export function useDeleteAttachment(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => apiFetch(`/cards/${cardId}/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

/// Pide una URL firmada de 60 s y la abre: el servidor la arma con el nombre
/// original, así que el navegador guarda "ñandú.pdf" y no la clave interna.
export async function downloadAttachment(cardId: string, attachment: Attachment): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`/cards/${cardId}/attachments/${attachment.id}/download`);
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// ── Comentarios ──────────────────────────────────────────────────────────

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  /// null mientras no se editó.
  editedAt: string | null;
  author: { id: string; name: string };
  /// Lo decide el servidor: solo lo propio se edita y se borra.
  mine: boolean;
}

export const MAX_COMMENT_LENGTH = 2000;

export function useComments(cardId: string) {
  return useQuery({
    queryKey: ['cards', 'comments', cardId],
    queryFn: () => apiFetch<Comment[]>(`/cards/${cardId}/comments`),
  });
}

// Cada alta, edición y baja queda en Actividad: se refresca todo lo que cuelga
// de ['projects'] y del Dashboard, no solo la lista.
export function useAddComment(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => apiFetch<Comment>(`/cards/${cardId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

export function useEditComment(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      apiFetch<Comment>(`/cards/${cardId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}

export function useDeleteComment(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiFetch(`/cards/${cardId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => refreshAfterBoardChange(queryClient),
  });
}
