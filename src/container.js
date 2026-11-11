'use strict';
/**
 * Raíz de composición: crea repositorios e infraestructura y los inyecta en los servicios.
 * Es el único lugar que conoce las implementaciones concretas (inversión de dependencias).
 * La API REST, el panel y el sitio público usan exactamente estos mismos servicios.
 */
const config = require('./config');
const { transaction } = require('./infrastructure/database/connection');
const cryptoSvc = require('./infrastructure/security/crypto');
const passwordHasher = require('./infrastructure/security/passwordHasher');
const passwordStrength = require('./infrastructure/security/passwordStrength');
const totp = require('./infrastructure/security/totp');
const sanitizer = require('./infrastructure/security/htmlSanitizer');
const fileTypeDetector = require('./infrastructure/storage/fileTypeDetector');
const imageProcessor = require('./infrastructure/storage/imageProcessor');
const malwareScanner = require('./infrastructure/storage/malwareScanner');
const { createStorage } = require('./infrastructure/storage/fileStorage');
const mailer = require('./infrastructure/mail/mailer');

const repos = {
  userRepository: require('./infrastructure/repositories/userRepository'),
  roleRepository: require('./infrastructure/repositories/roleRepository'),
  credentialRepository: require('./infrastructure/repositories/credentialRepository'),
  auditRepository: require('./infrastructure/repositories/auditRepository'),
  mediaRepository: require('./infrastructure/repositories/mediaRepository'),
  newsRepository: require('./infrastructure/repositories/newsRepository'),
  pageRepository: require('./infrastructure/repositories/pageRepository'),
  sliderRepository: require('./infrastructure/repositories/sliderRepository'),
  statsRepository: require('./infrastructure/repositories/statsRepository'),
  documentRepository: require('./infrastructure/repositories/documentRepository'),
  pqrsdRepository: require('./infrastructure/repositories/pqrsdRepository'),
  institutionRepository: require('./infrastructure/repositories/institutionRepository'),
};

const { createAuditService } = require('./application/auditService');
const { createAuthService } = require('./application/authService');
const { createUserService } = require('./application/userService');
const { createRoleService } = require('./application/roleService');
const { createMediaService } = require('./application/mediaService');
const { createPageService } = require('./application/pageService');
const { createNewsService } = require('./application/newsService');
const { createSliderService } = require('./application/sliderService');
const { createStatsService } = require('./application/statsService');
const { createDocumentService } = require('./application/documentService');
const { createPqrsdService } = require('./application/pqrsdService');
const { createSearchService } = require('./application/searchService');
const { createInstitutionService } = require('./application/institutionService');

const audit = createAuditService({ auditRepository: repos.auditRepository, hashIp: (ip) => cryptoSvc.statsHash('audit-ip', ip).slice(0, 16) });
const authService = createAuthService({
  ...repos,
  passwordHasher,
  passwordStrength,
  totp,
  crypto: cryptoSvc,
  mailer,
  audit,
  appUrl: config.appUrl,
  transaction,
});
const mediaService = createMediaService({
  mediaRepository: repos.mediaRepository,
  storage: createStorage(config.mediaDir),
  fileTypeDetector,
  imageProcessor,
  malwareScanner,
  limits: config.uploads,
  audit,
  transaction,
});
const pageService = createPageService({ pageRepository: repos.pageRepository, mediaService, sanitizer, audit, transaction });
const newsService = createNewsService({ newsRepository: repos.newsRepository, mediaService, sanitizer, audit, transaction });
const documentService = createDocumentService({
  documentRepository: repos.documentRepository,
  storage: createStorage(config.uploadsDir),
  fileTypeDetector,
  malwareScanner,
  maxBytes: config.uploads.maxDocumentBytes,
  audit,
  transaction,
});

const services = {
  audit,
  authService,
  userService: createUserService({ ...repos, passwordHasher, authService, audit, transaction }),
  roleService: createRoleService({ ...repos, audit, transaction }),
  mediaService,
  pageService,
  newsService,
  sliderService: createSliderService({ sliderRepository: repos.sliderRepository, mediaService, audit, transaction }),
  statsService: createStatsService({ statsRepository: repos.statsRepository, statsHash: cryptoSvc.statsHash, retentionDays: config.stats.retentionDays }),
  documentService,
  pqrsdService: createPqrsdService({ pqrsdRepository: repos.pqrsdRepository, audit }),
  institutionService: createInstitutionService(repos),
  searchService: createSearchService({ pageService, newsService, documentService }),
};

module.exports = services;
