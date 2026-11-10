"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
/**
 * Salud para el balanceador o el orquestador, sin información sensible:
 *  - /health/live: el proceso responde;
 *  - /health/ready: además la base de datos responde y no hay migraciones pendientes.
 * Solo devuelven { estado } (sin versiones, rutas, hosts ni errores).
 */
const common_1 = require("@nestjs/common");
const db_service_1 = require("../../../infrastructure/database/db.service");
const route_spec_1 = require("../route-spec");
let HealthController = class HealthController {
    db;
    constructor(db) {
        this.db = db;
    }
    live(res) {
        res.setHeader('Cache-Control', 'no-store');
        res.json({ estado: 'ok' });
    }
    async ready(res) {
        res.setHeader('Cache-Control', 'no-store');
        try {
            await this.db.scalar('SELECT 1');
            const pending = await this.db.dataSource.showMigrations();
            if (pending)
                res.status(503).json({ estado: 'migraciones_pendientes' });
            else
                res.json({ estado: 'ok' });
        }
        catch {
            res.status(503).json({ estado: 'no_disponible' });
        }
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, route_spec_1.WebRoute)('get', '/health/live', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "live", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/health/ready', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "ready", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], HealthController);
//# sourceMappingURL=health.controller.js.map