import { ConfigMapModel, DeploymentConfigModel, DeploymentModel, PodModel } from '@/shared/k8s';
import { fromRef, toRef } from './kindRef';

describe('kind references (SRCH-3)', () => {
  it('writes the core group as "core"', () => {
    expect(toRef(PodModel)).toBe('core~v1~Pod');
    expect(fromRef('core~v1~Pod')).toBe(PodModel);
    expect(fromRef(toRef(ConfigMapModel))).toBe(ConfigMapModel);
  });

  it('keeps named and dotted groups', () => {
    expect(toRef(DeploymentModel)).toBe('apps~v1~Deployment');
    expect(fromRef('apps~v1~Deployment')).toBe(DeploymentModel);
    expect(toRef(DeploymentConfigModel)).toBe('apps.openshift.io~v1~DeploymentConfig');
    expect(fromRef('apps.openshift.io~v1~DeploymentConfig')).toBe(DeploymentConfigModel);
  });

  it.each(['', 'Pod', 'core~v1', 'core~v1~Pod~x', 'core~~Pod', 'example.com~v1~Widget', 'apps~v2~Deployment'])(
    'returns undefined for the unknown or malformed reference %j',
    (ref) => {
      expect(fromRef(ref)).toBeUndefined();
    },
  );
});
