import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UpdateBanner } from '../../src/components/UpdateBanner';

describe('UpdateBanner', () => {
  it('renders with default message', () => {
    render(<UpdateBanner onAccept={vi.fn()} />);
    expect(screen.getByText('A new version is available.')).toBeInTheDocument();
    expect(screen.getByText('Update')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<UpdateBanner message="Please update!" onAccept={vi.fn()} />);
    expect(screen.getByText('Please update!')).toBeInTheDocument();
  });

  it('calls onAccept when update button clicked', () => {
    const onAccept = vi.fn();
    render(<UpdateBanner onAccept={onAccept} />);
    fireEvent.click(screen.getByText('Update'));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('renders dismiss button when onDismiss provided', () => {
    const onDismiss = vi.fn();
    render(<UpdateBanner onAccept={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.getByText('Later')).toBeInTheDocument();
  });

  it('does not render dismiss button when onDismiss not provided', () => {
    render(<UpdateBanner onAccept={vi.fn()} />);
    expect(screen.queryByText('Later')).not.toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    render(<UpdateBanner onAccept={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Later'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('applies custom className', () => {
    render(<UpdateBanner onAccept={vi.fn()} className="my-banner" />);
    expect(screen.getByRole('alert')).toHaveClass('my-banner');
  });

  it('applies custom style', () => {
    render(
      <UpdateBanner onAccept={vi.fn()} style={{ color: 'green' }} />,
    );
    expect(screen.getByRole('alert').style.color).toBe('green');
  });

  it('uses custom button labels', () => {
    render(
      <UpdateBanner
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        acceptLabel="Reload Now"
        dismissLabel="Not Yet"
      />,
    );
    expect(screen.getByText('Reload Now')).toBeInTheDocument();
    expect(screen.getByText('Not Yet')).toBeInTheDocument();
  });

  it('has role="alert" for accessibility', () => {
    render(<UpdateBanner onAccept={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
