import { createContext } from 'react';

/**
 * `key=value` labels of the listed objects, offered by {@link DataViewLabelFilter} as typeahead suggestions.
 * `ConsoleDataView` provides them through context so the filter element's props stay stable: `DataViewFilters`
 * resets its selected category whenever a filter's props change.
 */
export const LabelSuggestionsContext = createContext<readonly string[]>([]);
