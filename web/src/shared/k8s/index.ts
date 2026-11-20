// Public API of the Kubernetes data layer (ADR-0022 §1). Every Kubernetes call and type goes through this module.
export * from './models';
export type * from './types';
export { PROJECT_ANNOTATIONS } from './types';
