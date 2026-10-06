import { render, screen } from '@testing-library/react';
import { PipelineStrip } from './PipelineStrip';

describe('PipelineStrip', () => {
  it('marks done, current and upcoming stages with text, not just colour', () => {
    render(<PipelineStrip stage={2} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Data, done');
    expect(items[1]).toHaveTextContent('AI, in progress');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[3]).toHaveTextContent('Cloud, not started');
  });
});
