// ⚠️ BORRADOR DE TEXTOS — hay que validarlos con el equipo.
//
// BACKEND.md §2 dice que cada etapa de avance "tiene un significado definido por
// el equipo" y que "la tabla de significados vive en el front", pero no trae las
// frases: solo los nombres (no iniciado / solución definida / desarrollo
// principal / en pruebas / validado). Las definiciones y los ejemplos de la
// escala de abajo son un primer borrador para que la pantalla funcione; son la
// sustancia de la medición, así que conviene que las revise quien define el
// método. Cambiarlas es editar este archivo: nada más los repite.

export interface ProgressStage {
  value: 0 | 25 | 50 | 75 | 100;
  /// La frase con la que el desarrollador elige la etapa (no el número).
  name: string;
  definition: string;
}

export const PROGRESS_STAGES: ProgressStage[] = [
  {
    value: 0,
    name: 'No iniciado',
    definition: 'Nadie empezó a trabajar en esto. Puede estar asignada, pero todavía no hay una solución pensada ni nada escrito.',
  },
  {
    value: 25,
    name: 'Solución definida',
    definition: 'Ya se sabe cómo se va a resolver: hay un enfoque acordado y los pasos están claros, pero falta llevarlo a cabo.',
  },
  {
    value: 50,
    name: 'Desarrollo principal',
    definition: 'El grueso del trabajo está hecho: lo esencial ya funciona y falta pulir, cubrir casos borde e integrar con el resto.',
  },
  {
    value: 75,
    name: 'En pruebas',
    definition: 'El desarrollo terminó y se está verificando: revisión, pruebas y corrección de lo que aparezca.',
  },
  {
    value: 100,
    name: 'Validado',
    definition: 'Probada y aceptada: cumple lo pedido y quien corresponde la dio por buena. Es lo único que cuenta como hecha.',
  },
];

export interface EffortLevel {
  value: 1 | 2 | 3 | 5 | 8 | 13;
  /// Cuánto pesa, en una palabra.
  magnitude: string;
  description: string;
  example: string;
}

// Sin horas: la escala mide tamaño relativo, no tiempo.
export const EFFORT_SCALE: EffortLevel[] = [
  {
    value: 1,
    magnitude: 'Mínima',
    description: 'Un cambio acotado y sin riesgo.',
    example: 'Corregir un texto, ajustar un color, cambiar una etiqueta.',
  },
  {
    value: 2,
    magnitude: 'Pequeña',
    description: 'Una tarea simple con un solo punto para tocar.',
    example: 'Agregar un campo opcional a un formulario ya existente.',
  },
  {
    value: 3,
    magnitude: 'Moderada',
    description: 'Tiene algunas partes, pero se entiende completa de una vez.',
    example: 'Un formulario nuevo con sus validaciones.',
  },
  {
    value: 5,
    magnitude: 'Mediana',
    description: 'Varias partes que hay que coordinar, o algo de incertidumbre.',
    example: 'Una pantalla nueva conectada a datos reales.',
  },
  {
    value: 8,
    magnitude: 'Grande',
    description: 'Toca varios componentes o tiene incógnitas: conviene revisar el enfoque antes de empezar.',
    example: 'Integrar un servicio externo con autenticación y manejo de errores.',
  },
  {
    value: 13,
    magnitude: 'Muy grande',
    description: 'Demasiado para una sola tarjeta: debería dividirse.',
    example: 'Rediseñar un módulo completo, con migración de datos.',
  },
];

export const effortLevel = (value: number | null): EffortLevel | undefined => EFFORT_SCALE.find((level) => level.value === value);
export const progressStage = (value: number): ProgressStage | undefined => PROGRESS_STAGES.find((stage) => stage.value === value);
