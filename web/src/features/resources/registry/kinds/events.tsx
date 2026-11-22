import { EventModel } from '@/shared/k8s';
import type { ResourceDescriptor } from '../types';

/**
 * Events (UI-3, T-0124): listed as OCP's event stream (`events/EventsPage`), not a table, so no columns or filters
 * here; no Events tab of their own.
 */
export const eventDescriptor: ResourceDescriptor = {
  model: EventModel,
  nav: { section: 'home', order: 20 },
  listLayout: 'eventStream',
  hasEventsTab: false,
  columns: [],
};
