import { useOutletContext } from 'react-router';
import type { K8sResource } from '@/shared/k8s';
import type { ResourceDescriptor } from '../registry/types';

/** What the details layout hands its tab routes through `<Outlet context>`: the loaded, live object. */
export interface ResourceDetailsContext {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
}

/** The details layout's object, for the tab route modules (Details, YAML, Events). Only valid inside a tab route. */
export function useResourceDetails(): ResourceDetailsContext {
  return useOutletContext<ResourceDetailsContext>();
}
