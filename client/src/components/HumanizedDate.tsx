import React, { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface HumanizedDateProps {
  date: string | Date;
  className?: string;
}

export const HumanizedDate: React.FC<HumanizedDateProps> = ({
  date,
  className = ''
}) => {
  const [humanizedText, setHumanizedText] = useState<string>('');
  
  const formatDate = (dateInput: string | Date): string => {
    if (!dateInput) return 'Nunca';
    
    const inputDate = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(inputDate.getTime())) return 'Data inválida';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - inputDate.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'Agora mesmo';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `Há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `Há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    } else if (diffInSeconds < 2592000) {
      const days = Math.floor(diffInSeconds / 86400);
      return `Há ${days} ${days === 1 ? 'dia' : 'dias'}`;
    } else if (diffInSeconds < 31536000) {
      const months = Math.floor(diffInSeconds / 2592000);
      return `Há ${months} ${months === 1 ? 'mês' : 'meses'}`;
    } else {
      const years = Math.floor(diffInSeconds / 31536000);
      return `Há ${years} ${years === 1 ? 'ano' : 'anos'}`;
    }
  };
  
  const formatFullDate = (dateInput: string | Date): string => {
    if (!dateInput) return 'Nunca';
    
    const inputDate = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(inputDate.getTime())) return 'Data inválida';
    
    return inputDate.toLocaleString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };
  
  useEffect(() => {
    const updateHumanizedText = () => {
      setHumanizedText(formatDate(date));
    };
    
    updateHumanizedText();
    
    // Atualizar a cada minuto
    const interval = setInterval(updateHumanizedText, 60000);
    
    return () => clearInterval(interval);
  }, [date]);
  
  if (!date) {
    return <span className={`text-gray-500 ${className}`}>Nunca</span>;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-gray-600 cursor-help ${className}`}>
            {humanizedText}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">{formatFullDate(date)}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default HumanizedDate;