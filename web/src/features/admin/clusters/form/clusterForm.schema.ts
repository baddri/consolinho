import { z } from 'zod';
import type {
  ClusterDetail,
  ClusterEnvironment,
  RegisterClusterRequest,
  UpdateClusterRequest,
} from '@/shared/api';
import { dnsLabel } from '@/shared/forms';

/** Contract §8.2 limits. */
const MAX_DISPLAY_NAME = 100;
const MAX_DESCRIPTION = 1000;
const MAX_URL = 2048;
/** Server limit of a CA bundle (`CaBundle.MaxSizeBytes`): 256 KiB of UTF-8 PEM text. */
export const MAX_CA_BUNDLE_BYTES = 256 * 1024;

/** The environments in the order the form offers them. */
export const CLUSTER_ENVIRONMENTS = [
  'production',
  'staging',
  'development',
] as const satisfies readonly ClusterEnvironment[];

/** Client copy of the Api's CLU-3 rule; the server reports it under `skipTlsVerify` too. */
export const SKIP_TLS_WITH_CA_MESSAGE = 'Skip TLS verification and a CA bundle are mutually exclusive.';

const WEB_CONSOLE_URL_MESSAGE = `Web console URL must be an absolute https:// URL of at most ${MAX_URL} characters.`;

/** Parses `value` as an absolute `https://` URL with a host; `null` when it is not one. */
function parseHttpsUrl(value: string): URL | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname !== '' ? url : null;
}

/**
 * The API server URL rule (CLU-1), worded like the Api's `ApiServerEndpoint`: absolute `https://`, host and optional
 * port only — a path other than `/`, a query, fragment or user info is refused.
 */
const apiUrl = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    let message: string | undefined;
    const url = parseHttpsUrl(value);
    if (value === '') message = 'API URL is required.';
    else if (value.length > MAX_URL) message = `API URL must be at most ${MAX_URL} characters long.`;
    else if (url === null) message = 'API URL must be an absolute https:// URL.';
    else if (
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      message =
        'API URL must contain only a host and an optional port (no path, query, fragment or user info).';
    }
    if (message !== undefined) ctx.addIssue({ code: 'custom', message });
  });

/**
 * Client rules of the register / edit cluster form (contract §8.2, CLU-1..3), mirroring the Api's validation with its
 * wording so most mistakes are caught before the request; the server stays authoritative (CA bundle parsing, size)
 * and its 400s land on the same fields. Text fields are trimmed like the Api trims them; blank optionals become
 * `null` in {@link toRegisterRequest} / {@link toUpdateRequest}.
 *
 * `environment` is a string in the form (no preselection on create, so the admin must choose consciously) and the
 * enum after parsing. `name` is validated in edit mode too, where it holds the existing, immutable name.
 */
export const clusterFormSchema = z
  .object({
    name: dnsLabel(40, { requiredMessage: 'Name is required.' }),
    displayName: z
      .string()
      .trim()
      .max(MAX_DISPLAY_NAME, `Display name must be at most ${MAX_DISPLAY_NAME} characters long.`),
    environment: z.string().pipe(z.enum(CLUSTER_ENVIRONMENTS, 'Choose production, staging or development.')),
    // No field yet: T-0148 adds the "Distribution" radio; until then create sends OpenShift and edit keeps the value.
    distribution: z.enum(['openShift', 'kubernetes']),
    description: z
      .string()
      .trim()
      .max(MAX_DESCRIPTION, `Description must be at most ${MAX_DESCRIPTION} characters long.`),
    apiUrl,
    caBundle: z
      .string()
      .trim()
      // Client-side pre-check of the server's byte limit; `TextEncoder` counts UTF-8 bytes like the server does.
      .refine((value) => new TextEncoder().encode(value).length <= MAX_CA_BUNDLE_BYTES, {
        message: 'The CA bundle must be at most 256 KiB.',
      }),
    skipTlsVerify: z.boolean(),
    webConsoleUrl: z
      .string()
      .trim()
      .refine((value) => value === '' || (value.length <= MAX_URL && parseHttpsUrl(value) !== null), {
        message: WEB_CONSOLE_URL_MESSAGE,
      }),
    isEnabled: z.boolean(),
    version: z.number(),
  })
  .refine((values) => !(values.skipTlsVerify && values.caBundle !== ''), {
    message: SKIP_TLS_WITH_CA_MESSAGE,
    path: ['skipTlsVerify'],
    // Checked even while other fields are invalid, so this error shows together with theirs.
    when: (payload) =>
      payload.issues.every((issue) => issue.path?.[0] !== 'skipTlsVerify' && issue.path?.[0] !== 'caBundle'),
  });

/** What the form fields hold (before parsing). */
export type ClusterFormInput = z.input<typeof clusterFormSchema>;

/** Parsed, trimmed form values. */
export type ClusterFormValues = z.output<typeof clusterFormSchema>;

/** Defaults of a fresh "Register cluster" form: every field needs one (see `applyServerErrors`); enabled by default. */
export const REGISTER_CLUSTER_DEFAULTS: ClusterFormInput = {
  name: '',
  displayName: '',
  environment: '',
  distribution: 'openShift',
  description: '',
  apiUrl: '',
  caBundle: '',
  skipTlsVerify: false,
  webConsoleUrl: '',
  isEnabled: true,
  version: 0,
};

/** Form values of an existing cluster (edit mode); `null`s become `''` and `version` is kept for the PUT. */
export function toClusterFormInput(cluster: ClusterDetail): ClusterFormInput {
  return {
    name: cluster.name,
    displayName: cluster.displayName,
    environment: cluster.environment,
    distribution: cluster.distribution,
    description: cluster.description ?? '',
    apiUrl: cluster.apiUrl,
    caBundle: cluster.caBundle ?? '',
    skipTlsVerify: cluster.skipTlsVerify,
    webConsoleUrl: cluster.webConsoleUrl ?? '',
    isEnabled: cluster.isEnabled,
    version: cluster.version,
  };
}

/** `''` → `null`: the contract's "not set" for optional text (an empty CA bundle means system trust, CLU-2). */
const orNull = (value: string): string | null => (value === '' ? null : value);

/** Editable fields shared by both request bodies. */
function settingsOf(values: ClusterFormValues) {
  return {
    displayName: orNull(values.displayName),
    apiUrl: values.apiUrl,
    environment: values.environment,
    distribution: values.distribution,
    webConsoleUrl: orNull(values.webConsoleUrl),
    description: orNull(values.description),
    caBundle: orNull(values.caBundle),
    skipTlsVerify: values.skipTlsVerify,
  };
}

/** `POST /api/admin/clusters` body (CLU-1). */
export function toRegisterRequest(values: ClusterFormValues): RegisterClusterRequest {
  return { name: values.name, ...settingsOf(values), isEnabled: values.isEnabled };
}

/** `PUT /api/admin/clusters/{name}` body (CLU-4) with the `version` the form was loaded with (ADM-4). */
export function toUpdateRequest(values: ClusterFormValues): UpdateClusterRequest {
  return { ...settingsOf(values), version: values.version };
}

/** CLU-3 (UI-only): saving a production cluster without TLS verification needs an explicit confirmation. */
export function needsInsecureProductionConfirmation(values: ClusterFormValues): boolean {
  return values.environment === 'production' && values.skipTlsVerify;
}
