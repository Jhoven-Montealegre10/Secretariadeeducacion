"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ConfigModule_1, AppModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = exports.HttpModule = exports.CitizenModule = exports.ContentModule = exports.IdentityModule = exports.PersistenceModule = exports.DatabaseModule = exports.ConfigModule = void 0;
/**
 * Módulo raíz: monolito modular. Cada módulo agrupa su infraestructura, sus servicios y sus
 * controladores; la inyección de dependencias de NestJS los conecta.
 *
 *   ConfigModule → DatabaseModule → (Security, Storage, Mail) → IdentityModule, ContentModule,
 *   CitizenModule → HttpModule (controladores API y web, guard, interceptor, filtro)
 */
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const typeorm_1 = require("@nestjs/typeorm");
const audit_service_1 = require("./application/audit.service");
const auth_service_1 = require("./application/auth.service");
const citizen_services_1 = require("./application/citizen.services");
const clock_1 = require("./application/clock");
const content_services_1 = require("./application/content.services");
const identity_services_1 = require("./application/identity.services");
const media_service_1 = require("./application/media.service");
const stats_service_1 = require("./application/stats.service");
const configuration_1 = require("./config/configuration");
const public_cache_service_1 = require("./infrastructure/cache/public-cache.service");
const data_source_1 = require("./infrastructure/database/data-source");
const db_service_1 = require("./infrastructure/database/db.service");
const mailer_service_1 = require("./infrastructure/mail/mailer.service");
const citizen_repositories_1 = require("./infrastructure/repositories/citizen.repositories");
const content_repositories_1 = require("./infrastructure/repositories/content.repositories");
const identity_repositories_1 = require("./infrastructure/repositories/identity.repositories");
const security_module_1 = require("./infrastructure/security/security.module");
const storage_module_1 = require("./infrastructure/storage/storage.module");
const api_interceptor_1 = require("./presentation/http/api/api.interceptor");
const admin_controller_1 = require("./presentation/http/api/controllers/admin.controller");
const auth_controller_1 = require("./presentation/http/api/controllers/auth.controller");
const content_controller_1 = require("./presentation/http/api/controllers/content.controller");
const docs_controller_1 = require("./presentation/http/api/controllers/docs.controller");
const public_controller_1 = require("./presentation/http/api/controllers/public.controller");
const error_filter_1 = require("./presentation/http/errors/error.filter");
const health_controller_1 = require("./presentation/http/observability/health.controller");
const metrics_service_1 = require("./presentation/http/observability/metrics.service");
const csrf_service_1 = require("./presentation/http/security/csrf.service");
const rate_limiter_service_1 = require("./presentation/http/security/rate-limiter.service");
const security_guard_1 = require("./presentation/http/security/security.guard");
const admin_web_controller_1 = require("./presentation/web/admin-web.controller");
const pqrsd_web_controller_1 = require("./presentation/web/pqrsd-web.controller");
const site_controller_1 = require("./presentation/web/site.controller");
let ConfigModule = ConfigModule_1 = class ConfigModule {
    static forRoot(config) {
        return { module: ConfigModule_1, providers: [{ provide: configuration_1.APP_CONFIG, useValue: config }], exports: [configuration_1.APP_CONFIG] };
    }
};
exports.ConfigModule = ConfigModule;
exports.ConfigModule = ConfigModule = ConfigModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], ConfigModule);
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [db_service_1.Db, public_cache_service_1.PublicCache, { provide: clock_1.CLOCK, useValue: clock_1.systemClock }],
        exports: [db_service_1.Db, public_cache_service_1.PublicCache, clock_1.CLOCK],
    })
], DatabaseModule);
const REPOSITORIES = [
    identity_repositories_1.UserRepository,
    identity_repositories_1.RoleRepository,
    identity_repositories_1.CredentialRepository,
    identity_repositories_1.AuditRepository,
    content_repositories_1.MediaRepository,
    content_repositories_1.NewsRepository,
    content_repositories_1.PageRepository,
    content_repositories_1.SliderRepository,
    content_repositories_1.DocumentRepository,
    content_repositories_1.InstitutionRepository,
    citizen_repositories_1.PqrsdRepository,
    citizen_repositories_1.StatsRepository,
];
let PersistenceModule = class PersistenceModule {
};
exports.PersistenceModule = PersistenceModule;
exports.PersistenceModule = PersistenceModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [...REPOSITORIES, audit_service_1.AuditService],
        exports: [...REPOSITORIES, audit_service_1.AuditService],
    })
], PersistenceModule);
let IdentityModule = class IdentityModule {
};
exports.IdentityModule = IdentityModule;
exports.IdentityModule = IdentityModule = __decorate([
    (0, common_1.Module)({
        providers: [auth_service_1.AuthService, identity_services_1.UserService, identity_services_1.RoleService, stats_service_1.StatsService],
        exports: [auth_service_1.AuthService, identity_services_1.UserService, identity_services_1.RoleService, stats_service_1.StatsService],
    })
], IdentityModule);
let ContentModule = class ContentModule {
};
exports.ContentModule = ContentModule;
exports.ContentModule = ContentModule = __decorate([
    (0, common_1.Module)({
        providers: [media_service_1.MediaService, content_services_1.PageService, content_services_1.NewsService, content_services_1.SliderService],
        exports: [media_service_1.MediaService, content_services_1.PageService, content_services_1.NewsService, content_services_1.SliderService],
    })
], ContentModule);
let CitizenModule = class CitizenModule {
};
exports.CitizenModule = CitizenModule;
exports.CitizenModule = CitizenModule = __decorate([
    (0, common_1.Module)({
        imports: [ContentModule],
        providers: [citizen_services_1.DocumentService, citizen_services_1.PqrsdService, citizen_services_1.InstitutionService, citizen_services_1.SearchService],
        exports: [citizen_services_1.DocumentService, citizen_services_1.PqrsdService, citizen_services_1.InstitutionService, citizen_services_1.SearchService],
    })
], CitizenModule);
/**
 * Capa de presentación. El ORDEN de los controladores es el orden de las rutas: las rutas
 * específicas van antes que los comodines (/admin/{*rest} y /:slug van al final).
 */
let HttpModule = class HttpModule {
};
exports.HttpModule = HttpModule;
exports.HttpModule = HttpModule = __decorate([
    (0, common_1.Module)({
        imports: [IdentityModule, ContentModule, CitizenModule],
        controllers: [health_controller_1.HealthController, docs_controller_1.DocsController, auth_controller_1.AuthController, admin_controller_1.AdminController, content_controller_1.ContentController, public_controller_1.PublicController, pqrsd_web_controller_1.PqrsdWebController, site_controller_1.SiteController, admin_web_controller_1.AdminWebController, site_controller_1.PageSlugController],
        providers: [
            csrf_service_1.CsrfService,
            rate_limiter_service_1.RateLimiter,
            metrics_service_1.MetricsService,
            docs_controller_1.OpenApiDocs,
            site_controller_1.BlockContext,
            { provide: core_1.APP_GUARD, useClass: security_guard_1.SecurityGuard },
            { provide: core_1.APP_INTERCEPTOR, useClass: api_interceptor_1.ApiInterceptor },
            { provide: core_1.APP_FILTER, useClass: error_filter_1.ErrorFilter },
        ],
        exports: [csrf_service_1.CsrfService, metrics_service_1.MetricsService, docs_controller_1.OpenApiDocs],
    })
], HttpModule);
let AppModule = AppModule_1 = class AppModule {
    static forRoot(config = (0, configuration_1.loadConfig)()) {
        return {
            module: AppModule_1,
            imports: [
                ConfigModule.forRoot(config),
                typeorm_1.TypeOrmModule.forRoot((0, data_source_1.dataSourceOptions)(config)),
                DatabaseModule,
                security_module_1.SecurityModule,
                storage_module_1.StorageModule,
                mailer_service_1.MailModule,
                PersistenceModule,
                HttpModule,
            ],
        };
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = AppModule_1 = __decorate([
    (0, common_1.Module)({})
], AppModule);
//# sourceMappingURL=app.module.js.map