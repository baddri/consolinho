import { apiVersionOf } from '@/shared/k8s';
import { configMapDescriptor } from './kinds/configmaps';
import { deploymentDescriptor } from './kinds/deployments';
import { eventDescriptor } from './kinds/events';
import { namespaceDescriptor } from './kinds/namespaces';
import { podDescriptor } from './kinds/pods';
import { projectDescriptor } from './kinds/projects';
import { replicaSetDescriptor } from './kinds/replicasets';
import { serviceDescriptor } from './kinds/services';
import type { ResourceDescriptor } from './types';

/**
 * Every kind the console renders (ADR-0023 §3). Adding a kind = one `kinds/<plural>.tsx` + one line here. Plurals must
 * be unique (unit-tested): they are the URL segment.
 *
 * Built on first use, not at module load: kind modules render owner/involved-object links that look kinds up here,
 * so the modules import each other in a cycle and a descriptor may not be initialised yet while this module loads.
 */
export function resourceDescriptors(): readonly ResourceDescriptor[] {
  registry ??= [
    projectDescriptor,
    eventDescriptor,
    podDescriptor,
    deploymentDescriptor,
    configMapDescriptor,
    replicaSetDescriptor,
    serviceDescriptor,
    namespaceDescriptor,
  ];
  return registry;
}

let registry: readonly ResourceDescriptor[] | undefined;
let byPlural: ReadonlyMap<string, ResourceDescriptor> | undefined;

/** Descriptor of a URL `:plural` segment; `undefined` = "Kind not supported yet". */
export function descriptorForPlural(plural: string): ResourceDescriptor | undefined {
  byPlural ??= new Map(resourceDescriptors().map((descriptor) => [descriptor.model.plural, descriptor]));
  return byPlural.get(plural);
}

/** Descriptor of an object reference (`apiVersion` + `kind`), for owner and involved-object links. */
export function descriptorForKind(apiVersion: string, kind: string): ResourceDescriptor | undefined {
  return resourceDescriptors().find(
    (descriptor) => descriptor.model.kind === kind && apiVersionOf(descriptor.model) === apiVersion,
  );
}
