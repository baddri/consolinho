import type { JSONSchema } from '@/shared/k8s';
import { API_VERSION, KIND, METADATA, OBJECT_META, POD_TEMPLATE_SPEC, sharedSchemas, wrapped } from './core';

/**
 * Trimmed `GET /openapi/v3/apis/apps/v1` (T-0210): Deployment with DeploymentSpec, DeploymentStrategy and the
 * PodTemplateSpec chain it references, plus the shared meta/core schemas (each v3 document is self-contained).
 */

const DEPLOYMENT_SPEC = 'io.k8s.api.apps.v1.DeploymentSpec';
const DEPLOYMENT_STRATEGY = 'io.k8s.api.apps.v1.DeploymentStrategy';
const ROLLING_UPDATE = 'io.k8s.api.apps.v1.RollingUpdateDeployment';
const LABEL_SELECTOR = 'io.k8s.apimachinery.pkg.apis.meta.v1.LabelSelector';
const INT_OR_STRING = 'io.k8s.apimachinery.pkg.util.intstr.IntOrString';

/** The `apis/apps/v1` document. */
export const appsV1Document = {
  components: {
    schemas: {
      ...sharedSchemas,
      [INT_OR_STRING]: {
        description:
          'IntOrString is a type that can hold an int32 or a string. When used in JSON or YAML marshalling and ' +
          'unmarshalling, it produces or consumes the inner type.',
        type: 'string',
        format: 'int-or-string',
      },
      [LABEL_SELECTOR]: {
        description:
          'A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions ' +
          'are ANDed. An empty label selector matches all objects. A null label selector matches no objects.',
        type: 'object',
        properties: {
          matchLabels: {
            description:
              'matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent ' +
              'to an element of matchExpressions, whose key field is "key", the operator is "In", and the values ' +
              'array contains only "value".',
            type: 'object',
            additionalProperties: { type: 'string', default: '' },
          },
        },
        'x-kubernetes-map-type': 'atomic',
      },
      [ROLLING_UPDATE]: {
        description: 'Spec to control the desired behavior of rolling update.',
        type: 'object',
        properties: {
          maxSurge: wrapped(
            INT_OR_STRING,
            'The maximum number of pods that can be scheduled above the desired number of pods. Value can be an ' +
              'absolute number (ex: 5) or a percentage of desired pods (ex: 10%). Defaults to 25%.',
          ),
          maxUnavailable: wrapped(
            INT_OR_STRING,
            'The maximum number of pods that can be unavailable during the update. Value can be an absolute number ' +
              '(ex: 5) or a percentage of desired pods (ex: 10%). Defaults to 25%.',
          ),
        },
      },
      [DEPLOYMENT_STRATEGY]: {
        description: 'DeploymentStrategy describes how to replace existing pods with new ones.',
        type: 'object',
        properties: {
          rollingUpdate: wrapped(
            ROLLING_UPDATE,
            'Rolling update config params. Present only if DeploymentStrategyType = RollingUpdate.',
          ),
          type: {
            description: 'Type of deployment. Can be "Recreate" or "RollingUpdate". Default is RollingUpdate.',
            type: 'string',
            enum: ['Recreate', 'RollingUpdate'],
          },
        },
      },
      [DEPLOYMENT_SPEC]: {
        description: 'DeploymentSpec is the specification of the desired behavior of the Deployment.',
        type: 'object',
        required: ['selector', 'template'],
        properties: {
          minReadySeconds: {
            description:
              'Minimum number of seconds for which a newly created pod should be ready without any of its container ' +
              'crashing, for it to be considered available. Defaults to 0.',
            type: 'integer',
            format: 'int32',
          },
          paused: { description: 'Indicates that the deployment is paused.', type: 'boolean' },
          replicas: {
            description:
              'Number of desired pods. This is a pointer to distinguish between explicit zero and not specified. ' +
              'Defaults to 1.',
            type: 'integer',
            format: 'int32',
          },
          revisionHistoryLimit: {
            description:
              'The number of old ReplicaSets to retain to allow rollback. This is a pointer to distinguish between ' +
              'explicit zero and not specified. Defaults to 10.',
            type: 'integer',
            format: 'int32',
          },
          selector: wrapped(
            LABEL_SELECTOR,
            'Label selector for pods. Existing ReplicaSets whose pods are selected by this will be the ones affected ' +
              "by this deployment. It must match the pod template's labels.",
          ),
          strategy: wrapped(
            DEPLOYMENT_STRATEGY,
            'The deployment strategy to use to replace existing pods with new ones.',
            { 'x-kubernetes-patch-strategy': 'retainKeys' },
          ),
          template: wrapped(
            POD_TEMPLATE_SPEC,
            'Template describes the pods that will be created. The only allowed template.spec.restartPolicy value ' +
              'is "Always".',
          ),
        },
      },
      'io.k8s.api.apps.v1.Deployment': {
        description: 'Deployment enables declarative updates for Pods and ReplicaSets.',
        type: 'object',
        properties: {
          apiVersion: { description: API_VERSION, type: 'string' },
          kind: { description: KIND, type: 'string' },
          metadata: wrapped(OBJECT_META, METADATA),
          spec: wrapped(DEPLOYMENT_SPEC, 'Specification of the desired behavior of the Deployment.'),
        },
        'x-kubernetes-group-version-kind': [{ group: 'apps', kind: 'Deployment', version: 'v1' }],
      },
    },
  },
} satisfies { components: { schemas: Record<string, JSONSchema> } };
