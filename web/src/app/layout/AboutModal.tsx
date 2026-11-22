import { AboutModal as PfAboutModal, Content, Skeleton } from '@patternfly/react-core';
import { useSystemInfo } from '@/shared/api';
import { PRODUCT_NAME, useLogoSrc } from '@/shared/branding';

/** Version and environment of this deployment (`GET /api/system/info`) as a description list, with loading/error. */
function SystemInfoItems() {
  const { data, isPending, isError } = useSystemInfo();
  if (isPending) {
    return <Skeleton width="60%" screenreaderText="Loading version information" />;
  }
  if (isError) {
    return <Content component="p">Version information unavailable</Content>;
  }
  return (
    <Content component="dl">
      <Content component="dt">{PRODUCT_NAME} version</Content>
      {/* Full value (commit SHA included); it may wrap instead of overflowing the modal. */}
      <Content component="dd" className="pf-v6-u-text-break-word">
        {data.version}
      </Content>
      <Content component="dt">Environment</Content>
      <Content component="dd">{data.environment}</Content>
    </Content>
  );
}

/**
 * The help menu's About dialog, like OCP's (`public/components/about-modal.tsx`): PF `AboutModal` with our logo and
 * product name, a one-line description and the deployment's version and environment. No Red Hat marks or watermark.
 */
export function AboutModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const logoSrc = useLogoSrc();
  return (
    <PfAboutModal
      isOpen={isOpen}
      onClose={onClose}
      productName={PRODUCT_NAME}
      brandImageSrc={logoSrc}
      brandImageAlt={PRODUCT_NAME}
      hasNoContentContainer
    >
      <Content component="p">
        {PRODUCT_NAME} operates a fleet of OpenShift clusters from one place, with the access your administrator
        granted you on each cluster.
      </Content>
      <Content>
        <SystemInfoItems />
      </Content>
    </PfAboutModal>
  );
}
