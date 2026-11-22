import {
  Flex,
  FlexItem,
  Icon,
  MenuToggle,
  Modal,
  ModalBody,
  ModalHeader,
  NumberInput,
  Select,
  SelectList,
  SelectOption,
  Switch,
  type MenuToggleElement,
  type ModalProps,
} from '@patternfly/react-core';
import {
  FontIcon,
  MouseIcon,
  RhUiAutoLightDarkModeIcon,
  RhUiCommentIcon,
} from '@patternfly/react-icons';
import { useState, type ReactNode, type Ref } from 'react';
import styles from './EditorSettingsModal.module.css';
import { MIN_FONT_SIZE, type EditorColorScheme, type EditorSettings } from './useEditorSettings';

const MODAL_ID = 'yaml-editor-settings';

/** Props for {@link SettingItem}. */
interface SettingItemProps {
  /** Prefix of the title (`<id>-title`) and description (`<id>-description`) ids the control points at. */
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** The control, labelled by the title and described by the description. */
  children: ReactNode;
}

/** One row of the modal: icon + bold title over the description, control on the right (PF "with configuration modal"). */
function SettingItem({ id, icon, title, description, children }: SettingItemProps) {
  return (
    <Flex
      alignItems={{ default: 'alignItemsCenter' }}
      justifyContent={{ default: 'justifyContentSpaceBetween' }}
      spaceItems={{ default: 'spaceItemsMd' }}
    >
      <FlexItem flex={{ default: 'flex_1' }}>
        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
          <Icon isInline>{icon}</Icon>
          <strong id={`${id}-title`} className="pf-v6-u-font-weight-bold">
            {title}
          </strong>
        </Flex>
        <div id={`${id}-description`}>{description}</div>
      </FlexItem>
      <FlexItem alignSelf={{ default: 'alignSelfCenter' }}>{children}</FlexItem>
    </Flex>
  );
}

const COLOR_SCHEMES: { value: EditorColorScheme; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Follow your user preference' },
  { value: 'dark', label: 'Dark', description: 'Always use dark mode' },
  { value: 'light', label: 'Light', description: 'Always use light mode' },
];

/** Props for {@link ColorSchemeSelect}. */
interface ColorSchemeSelectProps {
  /** Prefix of the row's title and description ids. */
  id: string;
  value: EditorColorScheme;
  onChange: (scheme: EditorColorScheme) => void;
}

/** The colour scheme single select (OCP `SimpleSelect`: toggle shows the choice, options carry a description). */
function ColorSchemeSelect({ id, value, onChange }: ColorSchemeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = COLOR_SCHEMES.find((option) => option.value === value);
  return (
    <Select
      isOpen={isOpen}
      selected={value}
      onOpenChange={setIsOpen}
      onSelect={(_event, next) => {
        const option = COLOR_SCHEMES.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
        setIsOpen(false);
      }}
      popperProps={{ appendTo: 'inline' }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          className={styles.toggle}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          isExpanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {selected?.label}
        </MenuToggle>
      )}
    >
      <SelectList>
        {COLOR_SCHEMES.map((option) => (
          <SelectOption key={option.value} value={option.value} description={option.description}>
            {option.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}

/** Props for {@link EditorSettingsModal}. */
export interface EditorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  /** Where the modal mounts: the full screen element while the editor is full screen, else the body. */
  appendTo?: ModalProps['appendTo'];
}

/**
 * "Editor settings" (OCP `modals/edit-yaml-settings-modal.tsx`), opened from the editor toolbar's settings control:
 * colour scheme (Default follows the console theme), font size, tooltips and sticky scroll, applied immediately.
 */
export function EditorSettingsModal({ isOpen, onClose, settings, appendTo }: EditorSettingsModalProps) {
  const { colorScheme, setColorScheme, fontSize, setFontSize, showTooltips, setShowTooltips, stickyScroll, setStickyScroll } = settings;
  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      appendTo={appendTo}
      aria-labelledby={`${MODAL_ID}-title`}
      aria-describedby={`${MODAL_ID}-body`}
    >
      <ModalHeader
        title="Editor settings"
        description="Changes apply immediately"
        labelId={`${MODAL_ID}-title`}
      />
      <ModalBody id={`${MODAL_ID}-body`}>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
          <SettingItem
            id={`${MODAL_ID}-color-scheme`}
            icon={<RhUiAutoLightDarkModeIcon />}
            title="Color scheme"
            description="Select the code editor color scheme"
          >
            <ColorSchemeSelect id={`${MODAL_ID}-color-scheme`} value={colorScheme} onChange={setColorScheme} />
          </SettingItem>
          <SettingItem
            id={`${MODAL_ID}-font-size`}
            icon={<FontIcon />}
            title="Font size"
            description="Adjust the font size of the code editor"
          >
            <NumberInput
              aria-labelledby={`${MODAL_ID}-font-size-title`}
              aria-describedby={`${MODAL_ID}-font-size-description`}
              inputAriaLabel="Enter a font size"
              minusBtnAriaLabel="Decrease font size"
              plusBtnAriaLabel="Increase font size"
              role="group"
              value={fontSize}
              min={MIN_FONT_SIZE}
              widthChars={2}
              onMinus={() => setFontSize(fontSize - 1)}
              onPlus={() => setFontSize(fontSize + 1)}
              onChange={(event) => setFontSize(Number(event.currentTarget.value))}
            />
          </SettingItem>
          <SettingItem
            id={`${MODAL_ID}-tooltips`}
            icon={<RhUiCommentIcon />}
            title="Tooltips"
            description="Show tooltips for Resource names, Field names, and definitions"
          >
            <Switch
              id={`${MODAL_ID}-tooltips-switch`}
              aria-labelledby={`${MODAL_ID}-tooltips-title`}
              aria-describedby={`${MODAL_ID}-tooltips-description`}
              isReversed
              isChecked={showTooltips}
              onChange={(_event, checked) => setShowTooltips(checked)}
            />
          </SettingItem>
          <SettingItem
            id={`${MODAL_ID}-sticky-scroll`}
            icon={<MouseIcon />}
            title="Sticky scroll"
            description="Pin scopes to the top of the editor so they are always visible"
          >
            <Switch
              id={`${MODAL_ID}-sticky-scroll-switch`}
              aria-labelledby={`${MODAL_ID}-sticky-scroll-title`}
              aria-describedby={`${MODAL_ID}-sticky-scroll-description`}
              isReversed
              isChecked={stickyScroll}
              onChange={(_event, checked) => setStickyScroll(checked)}
            />
          </SettingItem>
        </Flex>
      </ModalBody>
    </Modal>
  );
}
