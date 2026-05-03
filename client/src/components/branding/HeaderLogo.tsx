/**
 * RF-06 — HeaderLogo (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-06, §3 D18, §3 D-FOUNDER-4
 * ADR-099 §2.4
 *
 * Componente swappable. variant='mark' (default) usa logo-mark, 'full' usa lockup.
 * Prop `asset` sobrepoe qualquer variant. onError fallback renderiza texto "Grindfy".
 */

import React, { useState } from 'react';
import logoMark from '@assets/grindfy-logo-mark.png';
import logoFull from '@assets/grindfy-logo-full.png';

interface HeaderLogoProps {
  asset?: string;
  alt?: string;
  className?: string;
  variant?: 'full' | 'mark';
}

export default function HeaderLogo({
  asset,
  alt = 'Grindfy',
  className = '',
  variant = 'mark',
}: HeaderLogoProps): JSX.Element {
  const [errored, setErrored] = useState(false);

  // Resolucao de src: asset > variant.
  const src =
    asset ?? (variant === 'full' ? (logoFull as string) : (logoMark as string));

  if (errored) {
    return (
      <span className={className} data-testid="header-logo-fallback">
        Grindfy
      </span>
    );
  }

  return (
    <img
      data-testid="header-logo"
      src={src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
