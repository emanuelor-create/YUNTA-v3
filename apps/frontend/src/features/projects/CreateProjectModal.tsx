import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Label, Modal } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { useCreateProject } from './useProjects';

// La paleta de marca (los mismos 5 hex que el backend acepta y AVATAR_PALETTE).
const COLORS: { hex: string; name: string }[] = [
  { hex: '#1b1917', name: 'Tinta' },
  { hex: '#b4552f', name: 'Terracota' },
  { hex: '#8a5a2b', name: 'Arcilla' },
  { hex: '#5c564d', name: 'Piedra' },
  { hex: '#8a8378', name: 'Gris cálido' },
];

const FIELD: CSSProperties = {
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

// Mediodía UTC: formatFullDate lee con getters locales y medianoche UTC se
// vería como el día anterior en UTC-3 (igual que en la configuración).
const toIso = (ymd: string) => (ymd ? `${ymd}T12:00:00.000Z` : null);

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Sin elección, el servidor reparte por la paleta: no se manda color.
  const [color, setColor] = useState<string | null>(null);

  const datesInvalid = !!startDate && !!endDate && endDate < startDate;
  const valid = name.trim().length > 0 && !datesInvalid;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!valid || create.isPending) return;
    create.mutate(
      {
        name: name.trim(),
        client: client.trim() || null,
        description: description.trim() || null,
        startDate: toIso(startDate),
        endDate: toIso(endDate),
        ...(color ? { color } : {}),
      },
      {
        onSuccess: (project) => {
          onClose();
          // Un proyecto recién creado está vacío: lo útil es caer en el tablero.
          navigate(`/projects/${project.id}/tablero`);
        },
      },
    );
  }

  return (
    <Modal
      kicker="Espacio de trabajo"
      title="Nuevo proyecto"
      width={600}
      onClose={onClose}
      footer={
        <>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Vas a ser el Owner. Arranca con cuatro columnas.</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={!valid || create.isPending} onClick={() => submit()}>
              {create.isPending ? 'Creando…' : 'Crear proyecto'}
            </Button>
          </div>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Label track="0.13em">Nombre</Label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Rediseño del sitio web" style={FIELD} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Label track="0.13em">Cliente</Label>
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Opcional" style={FIELD} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Label track="0.13em">Resumen</Label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué es este proyecto, en una o dos líneas." style={{ ...FIELD, resize: 'vertical' }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Label track="0.13em">Inicio</Label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={FIELD} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Label track="0.13em">Entrega</Label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...FIELD, ...(datesInvalid ? { borderColor: 'var(--accent)' } : null) }}
            />
          </label>
        </div>
        {datesInvalid && <span style={{ fontSize: 12.5, color: 'var(--accent-ink)', marginTop: -10 }}>La entrega no puede ser anterior al inicio.</span>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Label track="0.13em">Color</Label>
          <div style={{ display: 'flex', gap: 10 }} role="radiogroup" aria-label="Color del proyecto">
            {COLORS.map((option) => {
              const selected = color === option.hex;
              return (
                <button
                  key={option.hex}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={option.name}
                  onClick={() => setColor(selected ? null : option.hex)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: option.hex,
                    cursor: 'pointer',
                    border: '2px solid var(--page)',
                    boxShadow: selected ? `0 0 0 2px ${option.hex}` : '0 0 0 1px var(--line-strong)',
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{color ? COLORS.find((c) => c.hex === color)?.name : 'Sin elegir: se asigna uno de la paleta.'}</span>
        </div>

        {create.isError && (
          <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>
            {create.error instanceof ApiError ? create.error.message : 'No se pudo crear el proyecto.'}
          </span>
        )}
        {/* Sin este botón (oculto) Enter no enviaría el formulario: el primario del footer está fuera del <form>. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
