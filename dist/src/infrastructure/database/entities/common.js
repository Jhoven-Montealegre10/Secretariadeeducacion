"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdatedAt = exports.CreatedAt = void 0;
const typeorm_1 = require("typeorm");
/** Marcas de tiempo con zona horaria (UTC en el servidor). */
const CreatedAt = () => (0, typeorm_1.CreateDateColumn)({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' });
exports.CreatedAt = CreatedAt;
const UpdatedAt = () => (0, typeorm_1.UpdateDateColumn)({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' });
exports.UpdatedAt = UpdatedAt;
//# sourceMappingURL=common.js.map