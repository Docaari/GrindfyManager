
import React from 'react';

interface ProTagProps {
  className?: string;
}

const ProTag: React.FC<ProTagProps> = ({ className = '' }) => {
  return (
    <span className={`
      inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold
      bg-gradient-to-r from-yellow-400 to-yellow-500
      text-yellow-900 shadow-sm
      ${className}
    `}>
      PRO
    </span>
  );
};

export default ProTag;
