import { useNavigate } from 'react-router';
import { useToast } from '@/shared/ui';
import { useRegisterCluster, useUpdateCluster } from '../api';
import { clusterDetailPath } from '../clusterTarget';
import { toRegisterRequest, toUpdateRequest, type ClusterFormValues } from './clusterForm.schema';

/**
 * The save step of the cluster form: registers (create) or updates (edit) the cluster, toasts and navigates —
 * after registering to the Credentials tab, where the admin adds the first credential (spec §5); after an edit to
 * the detail page. Rejections propagate so `useFormProblem` can map them onto the fields.
 */
export function useSaveCluster(isEdit: boolean): (values: ClusterFormValues) => Promise<void> {
  const navigate = useNavigate();
  const toast = useToast();
  const register = useRegisterCluster();
  const update = useUpdateCluster();

  return async (values) => {
    if (isEdit) {
      const cluster = await update.mutateAsync({ name: values.name, ...toUpdateRequest(values) });
      toast.success(`Cluster ${cluster.name} updated`);
      await navigate(clusterDetailPath(cluster.name));
    } else {
      const cluster = await register.mutateAsync(toRegisterRequest(values));
      toast.success(`Cluster ${cluster.name} registered`);
      await navigate(`${clusterDetailPath(cluster.name)}/credentials`);
    }
  };
}
