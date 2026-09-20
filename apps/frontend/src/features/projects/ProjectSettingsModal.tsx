import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Label, Modal, SettingsRow } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import {
  ProjectDetail,
  useArchiveProject,
  useChangeOwner,
  useDeleteProject,
  useUpdateProject,
} from './useProjectDetail';

interface FormState {
  name: string;
  client: string;
  description: string;
  startDate: string;
  endDate: string;
  ownerId: string;
}

// Las fechas se guardan a mediodía UTC: formatFullDate lee con getters
// locales, y medianoche UTC se vería como el día anterior en UTC-3.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (value: string) => (value ? `${value}T12:00:00.000Z` : null);

function initialForm(project: ProjectDetail): FormState {
  const owner = project.members.find((m) => m.role === 'OWNER') ?? project.members[0];
  return {
    name: project.name,
    client: project.client ?? '',
    description: project.description ?? '',
    startDate: toDateInput(project.startDate),
    endDate: toDateInput(project.endDate),
    ownerId: owner?.userId ?? '',
  };
}

const FIELD_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--sans)',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'var(--field)',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
};

export function ProjectSettingsModal({
  project,
  focusOwner,
  onClose,
}: {
  project: ProjectDetail;
  /// "Cambiar" en Personas abre el modal con el campo Responsable enfocado.
  focusOwner?: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const update = useUpdateProject(project.id);
  const changeOwner = useChangeOwner(project.id);
  const archive = useArchiveProject(project.id);
  const remove = useDeleteProject(project.id);

  // Línea base fija al abrir: si el detalle se refresca mientras se edita,
  // "Sin guardar" no tiene que cambiar solo.
  const [initial] = useState(() => initialForm(project));
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(null);
  const [highlightOwner, setHighlightOwner] = useState(!!focusOwner);
  const ownerRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!focusOwner) return;
    ownerRef.current?.focus();
    const timer = setTimeout(() => setHighlightOwner(false), 2000);
    return () => clearTimeout(timer);
  }, [focusOwner]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const dirty = (Object.keys(form) as (keyof FormState)[]).some((key) => form[key] !== initial[key]);
  const datesInvalid = !!form.startDate && !!form.endDate && form.endDate < form.startDate;
  const valid = form.name.trim().length > 0 && !datesInvalid;
  const saving = update.isPending || changeOwner.isPending;

  async function handleSave() {
    setError(null);
    try {
      const fields: Record<string, string | null> = {};
      if (form.name !== initial.name) fields.name = form.name;
      if (form.client !== initial.client) fields.client = form.client;
      if (form.description !== initial.description) fields.description = form.description;
      if (form.startDate !== initial.startDate) fields.startDate = fromDateInput(form.startDate);
      if (form.endDate !== initial.endDate) fields.endDate = fromDateInput(form.endDate);

      if (Object.keys(fields).length) await update.mutateAsync(fields);
      if (form.ownerId !== initial.ownerId) {
        await changeOwner.mutateAsync({ newOwnerId: form.ownerId, currentOwnerId: initial.ownerId || null });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    }
  }

  async function handleArchive() {
    if (confirming !== 'archive') return setConfirming('archive');
    try {
      await archive.mutateAsync(!project.archivedAt);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo archivar.');
    }
  }

  async function handleDelete() {
    if (confirming !== 'delete') return setConfirming('delete');
    try {
      await remove.mutateAsync();
      onClose();
      navigate('/projects');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar.');
    }
  }

  const archived = !!project.archivedAt;

  return (
    <Modal
      kicker="Proyecto"
      title="Configuración"
      width={720}
      onClose={onClose}
      footer={
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: dirty ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dirty ? 'var(--accent)' : 'var(--ok)' }} />
            {dirty ? 'Sin guardar' : 'Al día'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="ghost"
              disabled={!dirty || saving}
              onClick={() => {
                setForm(initial);
                setError(null);
              }}
            >
              Descartar
            </Button>
            <Button variant="primary" disabled={!dirty || !valid || saving} onClick={handleSave}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <SettingsRow title="Nombre" hint="Cómo aparece en el sidebar y en la grilla.">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} style={FIELD_STYLE} />
        </SettingsRow>
        <SettingsRow title="Cliente" hint="Opcional. Se muestra en el breadcrumb.">
          <input value={form.client} onChange={(e) => set('client', e.target.value)} style={FIELD_STYLE} />
        </SettingsRow>
        <SettingsRow title="Resumen" hint="Qué es este proyecto, en una o dos líneas.">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            style={{ ...FIELD_STYLE, resize: 'vertical' }}
          />
        </SettingsRow>
        <SettingsRow title="Plazos" hint="Inicio y fin alimentan el cronograma y el estado del proyecto.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Inicio</Label>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} style={FIELD_STYLE} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Fin</Label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                  style={{ ...FIELD_STYLE, ...(datesInvalid ? { borderColor: 'var(--accent)' } : null) }}
                />
              </label>
            </div>
            {datesInvalid && (
              <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>El fin no puede ser anterior al inicio.</span>
            )}
          </div>
        </SettingsRow>
        <SettingsRow title="Responsable" hint="Pasa a Owner; el actual queda como Editor.">
          <select
            ref={ownerRef}
            value={form.ownerId}
            onChange={(e) => set('ownerId', e.target.value)}
            style={{
              ...FIELD_STYLE,
              ...(highlightOwner ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : null),
            }}
          >
            {project.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </SettingsRow>

        <div style={{ marginTop: 12, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <Label track="0.13em" style={{ color: 'var(--accent-ink)' }}>
            Acciones sensibles
          </Label>
        </div>
        <SettingsRow
          title={archived ? 'Desarchivar' : 'Archivar'}
          hint={
            confirming === 'archive'
              ? archived
                ? 'Vuelve a la lista de proyectos activos.'
                : 'Sale de la lista de activos. Podés desarchivarlo cuando quieras.'
              : archived
                ? 'El proyecto está archivado.'
                : 'Lo saca de la lista sin borrar nada.'
          }
        >
          <div>
            <Button
              variant={confirming === 'archive' ? 'primary' : 'ghost'}
              disabled={archive.isPending}
              onClick={handleArchive}
              style={confirming === 'archive' ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >
              {confirming === 'archive' ? 'Confirmar' : archived ? 'Desarchivar proyecto' : 'Archivar proyecto'}
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          title="Eliminar"
          hint={
            confirming === 'delete'
              ? 'Se borran el tablero, las tarjetas, los adjuntos y la actividad. No se puede deshacer.'
              : 'Borra el proyecto y todo lo que tiene adentro.'
          }
        >
          <div>
            <Button
              variant={confirming === 'delete' ? 'primary' : 'danger'}
              disabled={remove.isPending}
              onClick={handleDelete}
              style={confirming === 'delete' ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >
              {confirming === 'delete' ? 'Confirmar' : 'Eliminar proyecto'}
            </Button>
          </div>
        </SettingsRow>

        {error && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>{error}</span>}
      </div>
    </Modal>
  );
}
