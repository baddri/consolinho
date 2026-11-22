import { NO_EVENT_FILTERS } from './eventStream';
import { EventStreamView } from './EventStreamView';
import { useResourceDetails } from '../details/detailsContext';

/**
 * Events tab (UI-5, OCP `ResourceEventStream` in `public/components/events.tsx`): the event stream without a toolbar,
 * limited server-side to the object (`involvedObject.uid`, plus name and kind like OCP) in its namespace. Lazy route
 * module; the details layout wraps it in a `PageBody`.
 */
export function ResourceEventsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { uid = '', name = '', namespace } = obj.metadata;
  return (
    <EventStreamView
      cluster={cluster}
      namespace={namespace}
      fieldSelector={`involvedObject.uid=${uid},involvedObject.name=${name},involvedObject.kind=${descriptor.model.kind}`}
      filters={NO_EVENT_FILTERS}
      isResourceStream
    />
  );
}
