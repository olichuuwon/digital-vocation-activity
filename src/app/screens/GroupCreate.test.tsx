import { fireEvent, render, screen } from '@testing-library/react';
import { groupCopy } from '../../content/groupSchema';
import { GroupCreate } from './GroupCreate';

const t = groupCopy.create;

describe('GroupCreate focus', () => {
  // Regression: focus used to move a frame later (requestAnimationFrame). On a slow phone that
  // landed while the player was typing their nickname, so the keystrokes went into the team name.
  it('moves focus in the same update as the swap, both ways', () => {
    render(<GroupCreate onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.ownName) }));
    expect(document.activeElement).toBe(screen.getByLabelText(t.customLabel));

    fireEvent.click(screen.getByRole('button', { name: t.useGenerated }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: new RegExp(t.ownName) }));
  });
});
