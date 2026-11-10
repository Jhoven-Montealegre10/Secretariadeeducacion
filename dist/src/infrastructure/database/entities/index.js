"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITIES = void 0;
const identity_entities_1 = require("./identity.entities");
const content_entities_1 = require("./content.entities");
__exportStar(require("./identity.entities"), exports);
__exportStar(require("./content.entities"), exports);
exports.ENTITIES = [
    identity_entities_1.RolEntity,
    identity_entities_1.RolPermisoEntity,
    identity_entities_1.UsuarioEntity,
    identity_entities_1.CodigoRecuperacionEntity,
    identity_entities_1.TokenRecuperacionEntity,
    identity_entities_1.SesionEntity,
    identity_entities_1.AuditoriaEventoEntity,
    content_entities_1.MedioEntity,
    content_entities_1.MedioUsoEntity,
    content_entities_1.NoticiaEntity,
    content_entities_1.NoticiaFotoEntity,
    content_entities_1.PaginaEntity,
    content_entities_1.SliderEntity,
    content_entities_1.DiapositivaEntity,
    content_entities_1.DocumentoEntity,
    content_entities_1.InstitucionEntity,
    content_entities_1.PqrsdEntity,
    content_entities_1.VisitaEntity,
    content_entities_1.SalEstadisticaEntity,
];
//# sourceMappingURL=index.js.map