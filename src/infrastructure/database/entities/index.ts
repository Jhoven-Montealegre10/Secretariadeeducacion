import {
  AuditoriaEventoEntity,
  CodigoRecuperacionEntity,
  RolEntity,
  RolPermisoEntity,
  SesionEntity,
  TokenRecuperacionEntity,
  UsuarioEntity,
} from './identity.entities';
import {
  DiapositivaEntity,
  DocumentoEntity,
  InstitucionEntity,
  MedioEntity,
  MedioUsoEntity,
  NoticiaEntity,
  NoticiaFotoEntity,
  PaginaEntity,
  PqrsdEntity,
  SalEstadisticaEntity,
  SliderEntity,
  VisitaEntity,
} from './content.entities';

export * from './identity.entities';
export * from './content.entities';

export const ENTITIES = [
  RolEntity,
  RolPermisoEntity,
  UsuarioEntity,
  CodigoRecuperacionEntity,
  TokenRecuperacionEntity,
  SesionEntity,
  AuditoriaEventoEntity,
  MedioEntity,
  MedioUsoEntity,
  NoticiaEntity,
  NoticiaFotoEntity,
  PaginaEntity,
  SliderEntity,
  DiapositivaEntity,
  DocumentoEntity,
  InstitucionEntity,
  PqrsdEntity,
  VisitaEntity,
  SalEstadisticaEntity,
];
