import * as React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button.js';
import { Chip } from './chip.js';
import { Divider } from './divider.js';
import { EmptyState } from './empty-state.js';
import { BottomSheet } from './bottom-sheet.js';
import { Dialog } from './dialog.js';
import { Field } from './field.js';
import { ListRow } from './list-row.js';
import { MenuTrigger } from './menu-trigger.js';
import { SegmentedControl } from './segmented-control.js';
import { StatItem } from './stat-item.js';
import { Status } from './status.js';
import { Tabs } from './tabs.js';
import { UserChip } from './user-chip.js';

describe('Button', () => {
  it('renders semantic button states without layout-only APIs', () => {
    render(
      <>
        <Button>Primary action</Button>
        <Button selected>Selected action</Button>
        <Button disabled>Disabled action</Button>
        <Button loading>Loading action</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Primary action' })).toHaveClass(
      'ui-button',
      'ui-button--primary',
      'ui-interactive-hover',
      'ui-focus-ring',
    );
    expect(screen.getByRole('button', { name: 'Selected action' })).toHaveClass('is-selected');
    expect(screen.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Loading action' })).toHaveClass('is-loading');
    expect(screen.getByRole('button', { name: 'Loading action' })).toContainElement(
      screen.getByText('Loading action'),
    );
    expect(
      screen.getByRole('button', { name: 'Loading action' }).querySelector('.ui-button__spinner'),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps focus-visible semantics on the real button element', () => {
    render(<Button>Continue</Button>);

    screen.getByRole('button', { name: 'Continue' }).focus();

    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('ui-focus-ring');
  });
});

describe('Field', () => {
  it('renders input states with label, error messaging, and focus-visible semantics', () => {
    render(
      <>
        <Field label="Display name" name="displayName" placeholder="Alexey" />
        <Field label="Room code" name="roomCode" invalid error="Room code is required" />
        <Field label="Board note" name="boardNote" multiline />
      </>,
    );

    const displayName = screen.getByLabelText('Display name');
    const roomCode = screen.getByLabelText(/Room code/);
    const boardNote = screen.getByLabelText('Board note');

    displayName.focus();

    expect(displayName).toHaveFocus();
    expect(displayName).toHaveClass('ui-field__control', 'ui-interactive-hover', 'ui-focus-ring');
    expect(roomCode).toHaveAttribute('aria-invalid', 'true');
    expect(roomCode).toHaveAttribute('aria-describedby');
    expect(roomCode).toHaveClass('is-error');
    expect(screen.getByText('Room code is required')).toHaveClass('ui-field__error');
    expect(boardNote.tagName).toBe('TEXTAREA');
  });

  it('generates a valid control id when id and name are omitted', () => {
    render(<Field label="Anonymous field" invalid error="Required" />);

    const control = screen.getByLabelText(/Anonymous field/);
    const describedBy = control.getAttribute('aria-describedby');

    expect(control).toHaveAttribute('id');
    expect(control.getAttribute('id')).not.toContain('undefined');
    expect(describedBy).toBeTruthy();
    expect(describedBy).not.toContain('undefined');
    expect(screen.getByText('Required')).toHaveAttribute('id', describedBy);
  });
});

describe('Tabs', () => {
  it('renders selected, disabled, and hover-safe tab states with roving semantics', () => {
    function TabsHarness() {
      const [value, setValue] = React.useState('stats');

      return (
        <Tabs
          ariaLabel="Profile sections"
          value={value}
          onValueChange={setValue}
          items={[
            { value: 'overview', label: 'Overview', panel: <div>Overview panel</div> },
            { value: 'stats', label: 'Stats', panel: <div>Stats panel</div> },
            { value: 'history', label: 'History', disabled: true, panel: <div>History panel</div> },
          ]}
        />
      );
    }

    render(<TabsHarness />);

    screen.getByRole('tab', { name: 'Stats' }).focus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Stats' }), { key: 'ArrowLeft' });

    expect(screen.getByRole('tablist', { name: 'Profile sections' })).toHaveClass('ui-tabs');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveClass(
      'ui-tabs__tab',
      'is-selected',
      'ui-interactive-hover',
      'ui-focus-ring',
    );
    expect(screen.getByRole('tab', { name: 'History' })).toBeDisabled();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Overview panel');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('tab', { name: 'Overview' }).getAttribute('id') ?? '',
    );
  });

  it('normalizes a stale controlled value so selected tab and panel stay aligned', () => {
    const view = render(
      <Tabs
        ariaLabel="Room sections"
        value="missing"
        items={[
          { value: 'overview', label: 'Overview', panel: <div>Overview panel</div> },
          { value: 'players', label: 'Players', panel: <div>Players panel</div> },
        ]}
      />,
    );

    const scoped = within(view.container);

    expect(scoped.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(scoped.getByRole('tab', { name: 'Players' })).toHaveAttribute('aria-selected', 'false');
    expect(scoped.getByRole('tabpanel')).toHaveTextContent('Overview panel');
    expect(scoped.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      scoped.getByRole('tab', { name: 'Overview' }).getAttribute('id') ?? '',
    );
    expect(scoped.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-controls',
      scoped.getByRole('tabpanel').getAttribute('id') ?? '',
    );
    expect(scoped.getByRole('tab', { name: 'Players' })).not.toHaveAttribute('aria-controls');
  });
});

describe('Dialog', () => {
  it('applies aria semantics, moves focus on open, traps focus, closes on Escape, and restores focus', () => {
    const onOpenChange = vi.fn();

    function DialogHarness() {
      const [open, setOpen] = React.useState(false);

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open dialog
          </button>
          <Dialog
            open={open}
            title="Leave room"
            description="You can rejoin later."
            onOpenChange={(nextOpen) => {
              onOpenChange(nextOpen);
              setOpen(nextOpen);
            }}
          >
            <Button>Cancel</Button>
            <Button variant="primary">Confirm</Button>
          </Dialog>
        </div>
      );
    }

    render(<DialogHarness />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Leave room' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(document.body).toHaveClass('ui-scroll-locked');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(trigger).toHaveFocus();
  });
});

describe('BottomSheet', () => {
  it('uses modal semantics, moves focus on open, and restores focus only after dismissing unmounts', async () => {
    const onOpenChange = vi.fn();

    function BottomSheetHarness() {
      const [open, setOpen] = React.useState(false);

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open sheet
          </button>
          <BottomSheet
            open={open}
            title="Room actions"
            onOpenChange={(nextOpen) => {
              onOpenChange(nextOpen);
              setOpen(nextOpen);
            }}
          >
            <Button>Leave room</Button>
          </BottomSheet>
        </div>
      );
    }

    render(<BottomSheetHarness />);

    const trigger = screen.getByRole('button', { name: 'Open sheet' });
    trigger.focus();
    fireEvent.click(trigger);

    const sheet = screen.getByRole('dialog', { name: 'Room actions' });
    const backdrop = sheet.parentElement;

    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(backdrop).toHaveAttribute('data-state', 'opening');
    expect(backdrop).toHaveClass('ui-bottom-sheet-backdrop');
    expect(screen.getByRole('button', { name: 'Leave room' })).toHaveFocus();
    expect(document.body).toHaveClass('ui-scroll-locked');

    await waitFor(() => {
      expect(backdrop).toHaveAttribute('data-state', 'open');
    });

    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(backdrop).toHaveAttribute('data-state', 'dismissing');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Room actions' })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('requires an accessible label when title is absent and does not inject a fixed dismiss button', () => {
    const onOpenChange = vi.fn();

    render(
      <BottomSheet open ariaLabel="Quick actions" onOpenChange={onOpenChange}>
        <Button>Dismiss from content</Button>
      </BottomSheet>,
    );

    const sheet = screen.getByRole('dialog', { name: 'Quick actions' });
    const backdrop = sheet.parentElement;

    expect(sheet).not.toHaveAttribute('aria-labelledby');
    expect(sheet).toHaveAttribute('aria-label', 'Quick actions');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop as Element);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Additional primitives', () => {
  it('renders a segmented control with keyboard navigation, roving focus, and no external focus stealing', () => {
    function SegmentedHarness() {
      const [value, setValue] = React.useState('grid');

      return (
        <div>
          <button type="button" onClick={() => setValue('grid')}>
            External change
          </button>
          <SegmentedControl
            ariaLabel="View mode"
            value={value}
            onValueChange={setValue}
            items={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
              { value: 'compact', label: 'Compact', disabled: true },
            ]}
          />
        </div>
      );
    }

    render(<SegmentedHarness />);

    expect(screen.getByRole('radiogroup', { name: 'View mode' })).toHaveClass(
      'ui-segmented-control',
    );
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveClass(
      'ui-segmented-control__option',
      'is-selected',
      'ui-interactive-hover',
      'ui-focus-ring',
    );
    screen.getByRole('radio', { name: 'Grid' }).focus();
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Grid' }), { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'List' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'false');

    screen.getByRole('button', { name: 'External change' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'External change' }));

    expect(screen.getByRole('button', { name: 'External change' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Compact' })).toBeDisabled();
  });

  it('renders a semantic menu trigger and list row without domain knowledge', () => {
    render(
      <>
        <MenuTrigger ariaLabel="Open options">More options</MenuTrigger>
        <ListRow
          title="Account"
          description="Shell-only account preferences"
          trailing={<span>Enabled</span>}
        />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Open options' })).toHaveClass(
      'ui-menu-trigger',
      'ui-interactive-hover',
      'ui-focus-ring',
    );
    expect(screen.getByRole('listitem')).toHaveClass('ui-list-row');
    expect(screen.getByText('Account')).toHaveClass('ui-list-row__title');
    expect(screen.getByText('Shell-only account preferences')).toHaveClass(
      'ui-list-row__description',
    );
    render(<ListRow as="button" title="Settings row" />);
    expect(screen.getByRole('button', { name: 'Settings row' })).toHaveAttribute('type', 'button');
  });

  it('renders chip, user chip, stat item, empty state, divider, and explicit status tones', () => {
    render(
      <>
        <Chip tone="accent">Selected</Chip>
        <UserChip name="Alexey" detail="Online" />
        <StatItem label="Matches" value="12" />
        <Status tone="info">Informational</Status>
        <Status tone="success" role="status">
          Saved
        </Status>
        <Status tone="warning" role="alert">
          Needs attention
        </Status>
        <Status tone="danger" role="alert">
          Failed
        </Status>
        <EmptyState
          title="Nothing here yet"
          description="Add content when the shell route is ready."
          action={<Button>Retry</Button>}
        />
        <Divider label="More" />
      </>,
    );

    expect(screen.getByText('Selected')).toHaveClass('ui-chip', 'ui-chip--accent');
    expect(screen.getByText('Alexey')).toHaveClass('ui-user-chip__name');
    expect(screen.getByText('Online')).toHaveClass('ui-user-chip__detail');
    expect(screen.getByText('12')).toHaveClass('ui-stat-item__value');
    expect(screen.getByText('Matches')).toHaveClass('ui-stat-item__label');
    expect(screen.getByText('Nothing here yet')).toHaveClass('ui-empty-state__title');
    expect(screen.getByText('Add content when the shell route is ready.')).toHaveClass(
      'ui-empty-state__description',
    );
    expect(screen.getByText('Informational')).toHaveClass('ui-status', 'ui-status--info');
    expect(screen.getByText('Informational')).not.toHaveAttribute('role');
    expect(screen.getByText('Saved')).toHaveClass('ui-status--success');
    expect(screen.getByText('Saved')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Needs attention')).toHaveClass('ui-status--warning');
    expect(screen.getByText('Needs attention')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Failed')).toHaveClass('ui-status--danger');
    expect(screen.getByText('Failed')).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('separator', { name: 'More' })).toHaveClass('ui-divider');
  });
});
