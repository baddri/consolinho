import {
  apiVersionOf,
  ClusterOperatorModel,
  ClusterServiceVersionModel,
  ClusterVersionModel,
  ConfigMapModel,
  DeploymentModel,
  findModel,
  InfrastructureModel,
  InstallPlanModel,
  K8S_MODELS,
  MachineModel,
  MachineSetModel,
  modelKey,
  NodeModel,
  ProjectModel,
  SubscriptionModel,
} from './models';

describe('k8s models', () => {
  it('builds apiVersion for the core and named groups', () => {
    expect(apiVersionOf(ConfigMapModel)).toBe('v1');
    expect(apiVersionOf(DeploymentModel)).toBe('apps/v1');
    expect(apiVersionOf(ProjectModel)).toBe('project.openshift.io/v1');
  });

  it('builds model keys as <group>/<version>/<plural>', () => {
    expect(modelKey(ConfigMapModel)).toBe('/v1/configmaps');
    expect(modelKey(DeploymentModel)).toBe('apps/v1/deployments');
  });

  it('finds a model by apiVersion and kind', () => {
    expect(findModel('apps/v1', 'Deployment')).toBe(DeploymentModel);
    expect(findModel('v1', 'Deployment')).toBeUndefined();
  });

  it.each([
    { model: NodeModel, apiVersion: 'v1', namespaced: false },
    { model: MachineModel, apiVersion: 'machine.openshift.io/v1beta1', namespaced: true },
    { model: MachineSetModel, apiVersion: 'machine.openshift.io/v1beta1', namespaced: true },
    { model: ClusterVersionModel, apiVersion: 'config.openshift.io/v1', namespaced: false },
    { model: ClusterOperatorModel, apiVersion: 'config.openshift.io/v1', namespaced: false },
    { model: InfrastructureModel, apiVersion: 'config.openshift.io/v1', namespaced: false },
    { model: ClusterServiceVersionModel, apiVersion: 'operators.coreos.com/v1alpha1', namespaced: true },
    { model: SubscriptionModel, apiVersion: 'operators.coreos.com/v1alpha1', namespaced: true },
    { model: InstallPlanModel, apiVersion: 'operators.coreos.com/v1alpha1', namespaced: true },
  ])('registers $model.kind with its scope', ({ model, apiVersion, namespaced }) => {
    expect(K8S_MODELS).toContain(model);
    expect(apiVersionOf(model)).toBe(apiVersion);
    expect(model.namespaced).toBe(namespaced);
    expect(findModel(apiVersion, model.kind)).toBe(model);
  });
});
