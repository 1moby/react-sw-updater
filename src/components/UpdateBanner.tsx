import React from 'react';

export interface UpdateBannerProps {
  message?: string;
  acceptLabel?: string;
  dismissLabel?: string;
  onAccept: () => void;
  onDismiss?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function UpdateBanner({
  message = 'A new version is available.',
  acceptLabel = 'Update',
  dismissLabel = 'Later',
  onAccept,
  onDismiss,
  className,
  style,
}: UpdateBannerProps) {
  return (
    <div
      role="alert"
      className={className}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 16px',
        backgroundColor: '#1a1a2e',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 9999,
        ...style,
      }}
    >
      <span>{message}</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onAccept}
          style={{
            padding: '6px 16px',
            backgroundColor: '#4361ee',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {acceptLabel}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '6px 16px',
              backgroundColor: 'transparent',
              color: '#ffffff',
              border: '1px solid #ffffff',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {dismissLabel}
          </button>
        )}
      </div>
    </div>
  );
}
