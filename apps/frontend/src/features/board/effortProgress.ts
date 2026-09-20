// Definición del método de medición — textos del equipo.
//
// Son la sustancia de la medición (BACKEND.md §2: cada etapa "tiene un
// significado definido por el equipo"; la tabla de significados vive en el
// front). Se editan acá y nada más los repite.

export interface ProgressStage {
  value: 0 | 25 | 50 | 75 | 100;
  /// La frase corta con la que se elige la etapa (no el número). Son los
  /// nombres de BACKEND.md §2: no iniciado / solución definida / desarrollo
  /// principal / en pruebas / validado.
  name: string;
  definition: string;
}

export const PROGRESS_STAGES: ProgressStage[] = [
  { value: 0, name: 'No iniciado', definition: 'Nadie tocó la tarjeta todavía.' },
  {
    value: 25,
    name: 'Solución definida',
    definition: 'Análisis o diseño iniciado y solución definida: ya sabemos cómo se va a resolver.',
  },
  { value: 50, name: 'Desarrollo principal', definition: 'Desarrollo principal realizado. Falta cerrar bordes y probar.' },
  { value: 75, name: 'En pruebas', definition: 'Desarrollo terminado, en pruebas o correcciones.' },
  { value: 100, name: 'Validado', definition: 'Validado y terminado. Nadie más tiene que volver acá.' },
];

export interface EffortLevel {
  value: 1 | 2 | 3 | 5 | 8 | 13;
  /// Cuánto pesa, en pocas palabras.
  magnitude: string;
  description: string;
  examples: string[];
  /// Cómo se rotulan los ejemplos. `null`: el texto va solo (el 13 no trae
  /// ejemplos sino una indicación).
  examplesLabel: string | null;
}

// Sin horas: la escala mide tamaño relativo, no tiempo.
export const EFFORT_SCALE: EffortLevel[] = [
  {
    value: 1,
    magnitude: 'Muy pequeña',
    description: 'Cambio de texto, parámetro, ajuste CSS. Trabajo prácticamente mecánico.',
    examples: ['Cambiar texto', 'Modificar etiqueta', 'Agregar un campo simple', 'Ajuste visual menor'],
    examplesLabel: 'Ej.',
  },
  {
    value: 2,
    magnitude: 'Pequeña',
    description: 'CRUD simple, modificación menor. Trabajo pequeño y conocido.',
    examples: ['Campo con validación', 'Modificar una consulta existente', 'Agregar un filtro', 'Regla sencilla'],
    examplesLabel: 'Ej.',
  },
  {
    value: 3,
    magnitude: 'Media',
    description: 'Nueva funcionalidad sencilla, sobre piezas que ya existen.',
    examples: ['Endpoint sencillo', 'Nuevo formulario', 'CRUD simple', 'Pantalla con componentes existentes'],
    examplesLabel: 'Ej.',
  },
  {
    value: 5,
    magnitude: 'Media/alta',
    description: 'Funcionalidad con varias reglas de negocio: toca varias capas.',
    examples: ['Varias reglas de negocio', 'Integración con otro módulo', 'Proceso de varias etapas', 'Front + back + BD'],
    examplesLabel: 'Ej.',
  },
  {
    value: 8,
    magnitude: 'Grande',
    description: 'Módulo o integración compleja. Conviene revisar el alcance antes de arrancar.',
    examples: ['Integración externa', 'Proceso complejo', 'Nuevo módulo', 'Migración', 'Muchas reglas'],
    examplesLabel: 'Ej.',
  },
  {
    value: 13,
    magnitude: 'Muy grande',
    description: 'Funcionalidad que debería dividirse: no la ejecutes como una sola tarea.',
    examples: ['Dividir antes de asignar'],
    examplesLabel: null,
  },
];

export const effortLevel = (value: number | null): EffortLevel | undefined => EFFORT_SCALE.find((level) => level.value === value);
export const progressStage = (value: number): ProgressStage | undefined => PROGRESS_STAGES.find((stage) => stage.value === value);

/// "Ej.: a · b · c" (o solo "Dividir antes de asignar" en el 13).
export const examplesText = (level: EffortLevel): string =>
  `${level.examplesLabel ? `${level.examplesLabel}: ` : ''}${level.examples.join(' · ')}`;
