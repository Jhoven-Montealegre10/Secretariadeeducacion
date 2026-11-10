"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageModule = exports.DOCUMENT_STORAGE = exports.MEDIA_STORAGE = void 0;
const common_1 = require("@nestjs/common");
const configuration_1 = require("../../config/configuration");
const file_storage_1 = require("./file-storage");
const image_processor_service_1 = require("./image-processor.service");
const malware_scanner_service_1 = require("./malware-scanner.service");
exports.MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
exports.DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');
let StorageModule = class StorageModule {
};
exports.StorageModule = StorageModule;
exports.StorageModule = StorageModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            image_processor_service_1.ImageProcessor,
            malware_scanner_service_1.MalwareScanner,
            { provide: exports.MEDIA_STORAGE, inject: [configuration_1.APP_CONFIG], useFactory: (c) => new file_storage_1.FileStorage(c.mediaDir) },
            { provide: exports.DOCUMENT_STORAGE, inject: [configuration_1.APP_CONFIG], useFactory: (c) => new file_storage_1.FileStorage(c.uploadsDir) },
        ],
        exports: [image_processor_service_1.ImageProcessor, malware_scanner_service_1.MalwareScanner, exports.MEDIA_STORAGE, exports.DOCUMENT_STORAGE],
    })
], StorageModule);
//# sourceMappingURL=storage.module.js.map