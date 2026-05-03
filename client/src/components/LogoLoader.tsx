import logoFull from '@assets/grindfy-logo-full.png';

interface LogoLoaderProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeMap: Record<NonNullable<LogoLoaderProps['size']>, string> = {
  sm: 'w-32',
  md: 'w-56',
  lg: 'w-80',
};

export function LogoLoader({
  fullScreen = false,
  size = 'md',
  label,
  className = '',
}: LogoLoaderProps) {
  const widthClass = sizeMap[size];

  const inner = (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      data-testid="logo-loader"
    >
      <div className={`relative ${widthClass}`}>
        <img
          src={logoFull}
          alt=""
          aria-hidden="true"
          className="block w-full select-none opacity-20"
          draggable={false}
        />
        <img
          src={logoFull}
          alt="Grindfy"
          className="logo-loader-shine pointer-events-none absolute inset-0 block w-full select-none"
          draggable={false}
        />
      </div>
      {label ? (
        <span className="text-poker-gold/80 text-sm tracking-wide">
          {label}
        </span>
      ) : null}
    </div>
  );

  if (!fullScreen) return inner;

  return (
    <div
      className="bg-poker-bg flex min-h-screen w-full items-center justify-center"
      role="status"
      aria-label={label ?? 'Carregando'}
    >
      {inner}
    </div>
  );
}

export default LogoLoader;
