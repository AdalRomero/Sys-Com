// src/types/email.ts
export interface EnviarCorreoParams {
  destino: string;
  asunto: string;
  mensaje: string;
}

export interface EnviarCorreoResultado {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface DetallesConfirmacion {
  titulo: string;
  descripcion: string;
  fecha: string;
}