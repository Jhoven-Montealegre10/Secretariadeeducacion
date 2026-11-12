import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { FileStorage } from './file-storage';
import { ImageProcessor } from './image-processor.service';
import { MalwareScanner } from './malware-scanner.service';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

@Global()
@Module({
  providers: [
    ImageProcessor,
    MalwareScanner,
    { provide: MEDIA_STORAGE, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new FileStorage(c.mediaDir) },
    { provide: DOCUMENT_STORAGE, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new FileStorage(c.uploadsDir) },
  ],
  exports: [ImageProcessor, MalwareScanner, MEDIA_STORAGE, DOCUMENT_STORAGE],
})
export class StorageModule {}
