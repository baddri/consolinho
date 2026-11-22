import type { Service } from '@/shared/k8s';
import { serviceLocations } from './services';

const ports = [
  { port: 80, nodePort: 30080 },
  { port: 443, nodePort: 30443 },
];

describe('serviceLocations (OCP ServiceLocation)', () => {
  it.each<[string, Service, string[]]>([
    [
      'ClusterIP: clusterIP:port',
      { spec: { clusterIP: '10.0.0.1', ports } },
      ['10.0.0.1:80', '10.0.0.1:443'],
    ],
    ['headless: None', { spec: { clusterIP: 'None', ports } }, ['None']],
    [
      'NodePort: clusterIP:nodePort',
      { spec: { type: 'NodePort', clusterIP: '10.0.0.1', ports } },
      ['10.0.0.1:30080', '10.0.0.1:30443'],
    ],
    ['LoadBalancer without ingress: Pending', { spec: { type: 'LoadBalancer', ports } }, ['Pending']],
    [
      'LoadBalancer: ingress hostname or IP',
      {
        spec: { type: 'LoadBalancer' },
        status: { loadBalancer: { ingress: [{ hostname: 'lb.example.com' }, { ip: '1.2.3.4' }] } },
      },
      ['lb.example.com', '1.2.3.4'],
    ],
    [
      'ExternalName: externalName:port',
      { spec: { type: 'ExternalName', externalName: 'db.example.com', ports } },
      ['db.example.com:80', 'db.example.com:443'],
    ],
  ])('%s', (_name, service, expected) => {
    expect(serviceLocations(service)).toEqual(expected);
  });
});
