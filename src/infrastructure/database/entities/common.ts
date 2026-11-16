import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** Marcas de tiempo con zona horaria (UTC en el servidor). */
export const CreatedAt = () => CreateDateColumn({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' });
export const UpdatedAt = () => UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' });
