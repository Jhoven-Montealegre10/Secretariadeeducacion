/**
 * Módulo raíz: monolito modular. Cada módulo agrupa su infraestructura, sus servicios y sus
 * controladores; la inyección de dependencias de NestJS los conecta.
 *
 *   ConfigModule → DatabaseModule → (Security, Storage, Mail) → IdentityModule, ContentModule,
 *   CitizenModule → HttpModule (controladores API y web, guard, interceptor, filtro)
 */
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './application/audit.service';
import { AuthService } from './application/auth.service';
import { DocumentService, InstitutionService, PqrsdService, SearchService } from './application/citizen.services';
import { CLOCK, systemClock } from './application/clock';
import { NewsService, PageService, SliderService } from './application/content.services';
import { RoleService, UserService } from './application/identity.services';
import { MediaService } from './application/media.service';
import { StatsService } from './application/stats.service';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/configuration';
import { PublicCache } from './infrastructure/cache/public-cache.service';
import { dataSourceOptions } from './infrastructure/database/data-source';
import { Db } from './infrastructure/database/db.service';
import { MailModule } from './infrastructure/mail/mailer.service';
import { PqrsdRepository, StatsRepository } from './infrastructure/repositories/citizen.repositories';
import {
  DocumentRepository,
  InstitutionRepository,
  MediaRepository,
  NewsRepository,
  PageRepository,
  SliderRepository,
} from './infrastructure/repositories/content.repositories';
import { AuditRepository, CredentialRepository, RoleRepository, UserRepository } from './infrastructure/repositories/identity.repositories';
import { SecurityModule } from './infrastructure/security/security.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { ApiInterceptor } from './presentation/http/api/api.interceptor';
import { AdminController } from './presentation/http/api/controllers/admin.controller';
import { AuthController } from './presentation/http/api/controllers/auth.controller';
import { ContentController } from './presentation/http/api/controllers/content.controller';
import { DocsController, OpenApiDocs } from './presentation/http/api/controllers/docs.controller';
import { PublicController } from './presentation/http/api/controllers/public.controller';
import { ErrorFilter } from './presentation/http/errors/error.filter';
import { HealthController } from './presentation/http/observability/health.controller';
import { MetricsService } from './presentation/http/observability/metrics.service';
import { CsrfService } from './presentation/http/security/csrf.service';
import { RateLimiter } from './presentation/http/security/rate-limiter.service';
import { SecurityGuard } from './presentation/http/security/security.guard';
import { AdminWebController } from './presentation/web/admin-web.controller';
import { PqrsdWebController } from './presentation/web/pqrsd-web.controller';
import { BlockContext, PageSlugController, SiteController } from './presentation/web/site.controller';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] };
  }
}

@Global()
@Module({
  providers: [Db, PublicCache, { provide: CLOCK, useValue: systemClock }],
  exports: [Db, PublicCache, CLOCK],
})
export class DatabaseModule {}

const REPOSITORIES = [
  UserRepository,
  RoleRepository,
  CredentialRepository,
  AuditRepository,
  MediaRepository,
  NewsRepository,
  PageRepository,
  SliderRepository,
  DocumentRepository,
  InstitutionRepository,
  PqrsdRepository,
  StatsRepository,
];

@Global()
@Module({
  providers: [...REPOSITORIES, AuditService],
  exports: [...REPOSITORIES, AuditService],
})
export class PersistenceModule {}

@Module({
  providers: [AuthService, UserService, RoleService, StatsService],
  exports: [AuthService, UserService, RoleService, StatsService],
})
export class IdentityModule {}

@Module({
  providers: [MediaService, PageService, NewsService, SliderService],
  exports: [MediaService, PageService, NewsService, SliderService],
})
export class ContentModule {}

@Module({
  imports: [ContentModule],
  providers: [DocumentService, PqrsdService, InstitutionService, SearchService],
  exports: [DocumentService, PqrsdService, InstitutionService, SearchService],
})
export class CitizenModule {}

/**
 * Capa de presentación. El ORDEN de los controladores es el orden de las rutas: las rutas
 * específicas van antes que los comodines (/admin/{*rest} y /:slug van al final).
 */
@Module({
  imports: [IdentityModule, ContentModule, CitizenModule],
  controllers: [
    HealthController,
    DocsController,
    AuthController,
    AdminController,
    ContentController,
    PublicController,
    PqrsdWebController,
    SiteController,
    AdminWebController,
    PageSlugController,
  ],
  providers: [
    CsrfService,
    RateLimiter,
    MetricsService,
    OpenApiDocs,
    BlockContext,
    { provide: APP_GUARD, useClass: SecurityGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiInterceptor },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
  exports: [CsrfService, MetricsService, OpenApiDocs],
})
export class HttpModule {}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig = loadConfig()): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        TypeOrmModule.forRoot(dataSourceOptions(config)),
        DatabaseModule,
        SecurityModule,
        StorageModule,
        MailModule,
        PersistenceModule,
        HttpModule,
      ],
    };
  }
}
