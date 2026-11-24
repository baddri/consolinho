// k6 load test for FleetConsole (T-0242): the request mix of people browsing the console, against one managed cluster.
// Runs inside the cluster as a Job (see job.yaml); a session Cookie header comes from the Secret consolinho-loadtest.
// Arrival rate steps up so per-pod CPU can be read against req/s from Prometheus at each plateau.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL;
const CLUSTER = __ENV.CLUSTER;
const NS = __ENV.NAMESPACE || 'consolinho';
const params = { headers: { Cookie: __ENV.COOKIE, Accept: 'application/json' }, tags: {} };

// [weight, name, path]: list pages dominate, as in the console; the rest are the calls every page shell makes.
const MIX = [
  [40, 'pods', `/api/clusters/${CLUSTER}/k8s/api/v1/namespaces/${NS}/pods?limit=250`],
  [15, 'deployments', `/api/clusters/${CLUSTER}/k8s/apis/apps/v1/namespaces/${NS}/deployments?limit=250`],
  [10, 'events', `/api/clusters/${CLUSTER}/k8s/api/v1/namespaces/${NS}/events?limit=250`],
  [10, 'pod-get', `/api/clusters/${CLUSTER}/k8s/api/v1/namespaces/${NS}/pods`], // replaced per call below
  [10, 'me', '/api/auth/me'],
  [10, 'clusters', '/api/clusters'],
  [5, 'spa', '/'],
];
const TOTAL = MIX.reduce((s, m) => s + m[0], 0);
const STEP = __ENV.STEP || '2m';
const steps = (__ENV.RATES || '5,20,40,80,120').split(',').map(Number);

export const options = {
  insecureSkipTLSVerify: true,
  discardResponseBodies: true,
  scenarios: {
    browse: {
      executor: 'ramping-arrival-rate',
      startRate: steps[0], timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 400,
      // Each rate: 20 s ramp, then a plateau of STEP.
      stages: steps.flatMap((r) => [{ target: r, duration: '20s' }, { target: r, duration: STEP }]),
    },
  },
  thresholds: { http_req_failed: ['rate<0.01'] },
};

let podNames = [];
export function setup() {
  const r = http.get(`${BASE}${MIX[0][2]}`, { headers: params.headers, responseType: 'text' });
  if (r.status !== 200) throw new Error(`session check failed: HTTP ${r.status} (cookie expired?)`);
  return { pods: (r.json('items') || []).map((p) => p.metadata.name) };
}

export default function (data) {
  podNames = data.pods;
  let pick = Math.random() * TOTAL;
  const [, name, path] = MIX.find((m) => (pick -= m[0]) < 0);
  const url = name === 'pod-get' && podNames.length
    ? `${BASE}${path}/${podNames[Math.floor(Math.random() * podNames.length)]}`
    : `${BASE}${path}`;
  const res = http.get(url, { headers: params.headers, tags: { name } });
  check(res, { ok: (r) => r.status === 200 });
}
