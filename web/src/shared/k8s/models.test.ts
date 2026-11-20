import { apiVersionOf, ConfigMapModel, DeploymentModel, findModel, modelKey, ProjectModel } from './models';

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
});
