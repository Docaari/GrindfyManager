import React from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HumanizedDateProps {
  date: string | Date;
  showTime?: boolean;
  relative?: boolean;
}

export default function HumanizedDate({ date, showTime = true, relative = false }: HumanizedDateProps) {
  if (!date) return <span>—</span>;

  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  
  if (isNaN(parsedDate.getTime())) {
    return <span>—</span>;
  }

  if (relative) {
    return (
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {formatDistanceToNow(parsedDate, { addSuffix: true, locale: ptBR })}
      </span>
    );
  }

  const formatString = showTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy';
  
  return (
    <span className="text-sm">
      {format(parsedDate, formatString, { locale: ptBR })}
    </span>
  );
}